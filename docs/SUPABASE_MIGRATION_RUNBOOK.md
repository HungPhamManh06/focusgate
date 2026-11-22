# FocusGate — Supabase Hosted Migration Runbook (`0005` → `0008`)

> [!CAUTION]
> **NEVER run `supabase db reset` on a production or staging Supabase database.** `db reset` drops and recreates the database, destroying all user data. Always use non-destructive forward migrations (`supabase migration list --remote`, `supabase migration repair --remote`, `supabase db push --remote`).

> [!WARNING]
> **Always pass `--remote` when operating on a hosted Supabase project.** In Supabase CLI v3+, database commands (`migration list`, `migration repair`, `db push`) default to your **local** database if `--remote` is omitted. Verify your CLI version first (`supabase --version`). *(Note: Legacy CLI v1/v2 builds used `--linked` instead of `--remote`; run `supabase migration list --help` and `supabase db push --help` to confirm the flag supported by your installed CLI.)*

---

## 1. Local PGlite vs. Hosted Supabase

- **Local development** uses embedded PGlite (`apps/web/lib/db/migrations.ts`), which tracks `migration:<filename>` and `pending_supersede:<filename>` in `auth.local_meta`.
- **Hosted Supabase** does **not** use `apps/web/lib/db/migrations.ts`. Hosted deployments execute ordered SQL files tracked in `supabase_migrations.schema_migrations`.
- Therefore, an existing hosted database at `0005` **must** explicitly bypass `0006`'s unguarded backfill using `supabase migration repair` before running `supabase db push --remote`.

---

## 2. Preflight: Verify Linked Project & Remote Migration History

1. Confirm your installed Supabase CLI version and supported flags:
   ```bash
   supabase --version
   supabase migration list --help
   supabase migration repair --help
   supabase db push --help
   ```

2. Confirm the intended hosted project reference before touching migration history:
   ```bash
   supabase projects list
   cat supabase/.temp/project-ref
   ```
   Verify that the linked project reference matches your target environment (e.g. staging vs. production).

3. Inspect the remote migration history:
   ```bash
   supabase migration list --remote
   ```
   Expected output shows two columns (`Local` vs. `Remote`). Confirm which state your remote database is in:

| State | Remote `schema_migrations` state | Procedure |
|---|---|---|
| **State A — Fresh** | No FocusGate migrations applied remotely | Section 3 (Fresh Installation) |
| **State B — At `0005`** | `20260101000005` applied remotely; `20260101000006`, `20260101000007`, `20260101000008` **not** applied | Section 4 (**Mandatory 12-Step Safe Bypass**) |
| **State C — At `0006`** | `20260101000006` already applied remotely; `20260101000007` and `20260101000008` pending | Section 5 (Normal Remote Push) |
| **State D — At `0007` / `0008`** | `20260101000007` applied remotely | Section 6 (Push `0008` if pending, or No-op) |

---

## 3. State A — Fresh Hosted Supabase Database

On a brand-new hosted project with no existing user data:

```bash
supabase db push --remote
```

Migrations `0001` through `0008` execute chronologically. Because `focus_sessions` is empty during initial setup, `0006` touches 0 rows, and `0007` + `0008` establish the final no-default `min_valid_minutes` constraints and `fn_validate_focus_session()` trigger.

---

## 4. State B — Existing Hosted Database at `0005` (12-Step Safe Procedure)

Follow these 12 steps in exact order:

1. **Confirm the intended hosted project reference:**
   ```bash
   supabase projects list
   cat supabase/.temp/project-ref
   ```
2. **Inspect remote migration history:**
   ```bash
   supabase migration list --remote
   ```
3. **Verify `0005` (`20260101000005`) is applied** in the `Remote` column.
4. **Verify `0006`, `0007`, and `0008` are NOT applied** in the `Remote` column.
5. **Verify the existing remote schema is actually in the `0005` state** (run in Supabase SQL Editor or `psql`):
   ```sql
   SELECT column_default, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'focus_sessions'
     AND column_name = 'min_valid_minutes';
   -- Expected at 0005: column_default = '1', is_nullable = 'NO'
   ```
6. **Back up the database before deployment** (create a manual backup/snapshot in the Supabase Dashboard or `pg_dump` before modifying migration history or schema).
7. **Mark `0006` as applied in remote migration history WITHOUT executing its SQL:**
   > **Important:** `supabase migration repair` updates **only** the `supabase_migrations.schema_migrations` tracking table; it does **not** execute `20260101000006_legacy_snapshot_and_insert_hardening.sql`.
   ```bash
   supabase migration repair --status applied 20260101000006 --remote
   ```
8. **Confirm `0006` is recorded as applied remotely:**
   ```bash
   supabase migration list --remote
   ```
   Expected: `20260101000006` appears in both `Local` and `Remote`.
9. **Confirm `0007` and `0008` remain pending remotely** (`Remote` column blank for `20260101000007` and `20260101000008`).
10. **Push `0007` and `0008` to the hosted database:**
    ```bash
    supabase db push --remote
    ```
    - `0007` drops `DEFAULT 1`, enforces `NOT NULL` + `CHECK`, and repairs only safe legacy rows (`user_settings.updated_at <= focus_sessions.started_at`).
    - `0008` idempotently synchronizes `public.fn_validate_focus_session()` so all trigger and constraint guarantees match a sequential `0001..0008` install.
11. **Run the post-migration SQL verification queries** (Section 7 below).
12. **Confirm the final migration history:**
    ```bash
    supabase migration list --remote
    ```
    Expected: `20260101000001` through `20260101000008` all show as applied in both `Local` and `Remote`.

---

## 5. State C — Existing Hosted Database at `0006`

If `20260101000006` was already applied remotely:

```bash
supabase migration list --remote
supabase db push --remote
```

- Applies `0007` and `0008`.
- **Irrecoverable Historical Limitation:** If `0006` already overwrote an active session's `min_valid_minutes` before `0007` was applied, the original threshold is not stored elsewhere in the database and cannot be reconstructed. The existing stored value is preserved without guessing.

---

## 6. State D — Existing Hosted Database at `0007` / `0008`

- Run `supabase migration list --remote`.
- If `20260101000008` is pending, run `supabase db push --remote` (`0008` is idempotent DDL + trigger sync with zero row mutations).
- If `20260101000008` is already applied, no action is needed.

---

## 7. Post-Migration SQL Verification Queries

```sql
-- 1. Confirm migration history includes 0006, 0007, and 0008
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20260101000005'
ORDER BY version;

-- 2. Confirm `min_valid_minutes` has NO default, is NOT NULL, and has CHECK constraint
SELECT column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'focus_sessions'
  AND column_name = 'min_valid_minutes';
-- Expected: column_default = NULL, is_nullable = 'NO'

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.focus_sessions'::regclass
  AND conname = 'focus_sessions_min_valid_minutes_check';
-- Expected: CHECK ((min_valid_minutes >= 1) AND (min_valid_minutes <= 120))

-- 3. Confirm no focus session violates threshold bounds
SELECT count(*) AS invalid_threshold_rows
FROM public.focus_sessions
WHERE min_valid_minutes IS NULL OR min_valid_minutes NOT BETWEEN 1 AND 120;
-- Expected: 0
```

---

## 8. Recovery If `0006` Repair Succeeded But `db push --remote` Failed

If Step 7 (`supabase migration repair --status applied 20260101000006 --remote`) succeeded, and Step 10 (`supabase db push --remote`) failed before `0007`/`0008` completed:

1. **Do NOT revert `0006` to `reverted`** (that would allow `db push --remote` to run the unsafe `0006` SQL!).
2. Verify `supabase migration list --remote` still shows `20260101000006` applied and `20260101000007` / `20260101000008` pending.
3. Resolve the transient network/connection/lock issue, then re-run:
   ```bash
   supabase db push --remote
   ```
   Both `0007` and `0008` are wrapped in `BEGIN ... COMMIT` and are idempotent, so re-running `supabase db push --remote` is safe.
