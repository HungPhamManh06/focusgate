# FocusGate — Supabase Hosted Migration Runbook (`0005` → `0008`)

> [!CAUTION]
> **NEVER run `supabase db reset` on a production or staging Supabase database.** `db reset` drops and recreates the database, destroying all user data. Always use non-destructive forward migrations (`supabase migration list`, `supabase migration repair`, `supabase db push`).

## 1. Why This Runbook Exists

- Local development uses embedded PGlite (`apps/web/lib/db/migrations.ts`), which automatically skips the unguarded historical migration `20260101000006_legacy_snapshot_and_insert_hardening.sql` when upgrading an existing `0005` workspace.
- **Hosted Supabase does NOT use `apps/web/lib/db/migrations.ts`.** Hosted deployments execute ordered SQL files tracked in `supabase_migrations.schema_migrations`.
- If a hosted Supabase database is currently at `0005` (`20260101000005_focus_validity_snapshot.sql`) and an operator runs `supabase db push` directly, Supabase will execute `0006` before `0007`. Migration `0006` contains an unguarded `UPDATE` that can overwrite legitimate active session snapshots when `user_settings.min_valid_focus_minutes` changed after session start.

---

## 2. Preflight: Inspect Current Remote Migration History

Link your CLI to the target project (if not already linked) and inspect the remote ledger:

```bash
supabase migration list
```

*(Note: On Supabase CLI v3+, pass `--linked` or `--remote` if required by your CLI version; check `supabase migration list --help`.)*

You can also inspect `supabase_migrations.schema_migrations` directly in the Supabase SQL Editor or via `psql`:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Identify which state your hosted database is in:

| State | `schema_migrations` versions present | Required Procedure |
|---|---|---|
| **State A — Fresh** | Empty / no FocusGate migrations | Section 3 (Fresh Installation) |
| **State B — At `0005`** | Includes `20260101000005`, **does NOT include** `20260101000006` or `20260101000007` | Section 4 (**Mandatory Safe Bypass**) |
| **State C — At `0006`** | Includes `20260101000006`, **does NOT include** `20260101000007` | Section 5 (Normal Push) |
| **State D — At `0007` or `0008`** | Includes `20260101000007` (and optionally `20260101000008`) | Section 6 (Push `0008` if pending, or No-op) |

---

## 3. State A — Fresh Supabase Database

On a brand-new database with no existing user data:

```bash
supabase db push
```

All migrations `0001` through `0008` run in chronological order. Because `focus_sessions` has 0 rows during fresh setup, `0006` touches 0 rows, and `0007` + `0008` establish the final no-default `min_valid_minutes` constraints and `fn_validate_focus_session()` trigger.

---

## 4. State B — Existing Supabase Database at `0005` (CRITICAL P1 PROCEDURE)

### Preconditions
1. Confirm `20260101000005` is listed in `supabase_migrations.schema_migrations`.
2. Confirm **neither** `20260101000006` **nor** `20260101000007` is applied yet.

### Step 1 — Mark `0006` as applied WITHOUT executing its SQL
`supabase migration repair` modifies **only** the `supabase_migrations.schema_migrations` tracking table; it does **not** execute `20260101000006_legacy_snapshot_and_insert_hardening.sql`:

```bash
supabase migration repair --status applied 20260101000006
```

Verify with `supabase migration list` that `20260101000006` now shows as applied on both Local and Remote, while `20260101000007` and `20260101000008` show as pending on Remote.

### Step 2 — Push `0007` and `0008`

```bash
supabase db push
```

- `0007` drops `DEFAULT 1` on `focus_sessions.min_valid_minutes`, enforces `NOT NULL` + `CHECK (min_valid_minutes between 1 and 120)`, and repairs legacy active sessions **only** when `user_settings.updated_at <= focus_sessions.started_at`.
- `0008` idempotently synchronizes `public.fn_validate_focus_session()` so every required schema and trigger invariant from `0006` is present without ever running `0006`'s unguarded backfill.

---

## 5. State C — Existing Supabase Database at `0006`

If `20260101000006` already ran previously:

```bash
supabase db push
```

- Applies `0007` and `0008` normally.
- Preserves any remaining snapshots and repairs any remaining safe legacy rows (`updated_at <= started_at`).
- **Irrecoverable Limitation:** If `0006` already overwrote an active session's `min_valid_minutes` before `0007` was applied, the original threshold is not stored elsewhere in the database and cannot be reconstructed. The existing stored value is preserved without guessing.

---

## 6. State D — Existing Supabase Database at `0007` / `0008`

- If `20260101000008` is pending, run `supabase db push` (`0008` is idempotent DDL + trigger sync with zero row mutations).
- If `20260101000008` is already applied, `supabase db push` is a no-op.

---

## 7. Post-Migration SQL Verification Queries

Run these read-only checks after any hosted upgrade:

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

## 8. Roll-Forward Recovery Guidance

- Never attempt to roll back by deleting `min_valid_minutes` or running `db reset`.
- If `supabase db push` fails mid-way on `0007` or `0008`, fix the environment/connection issue and re-run `supabase db push` (`0007` and `0008` are transactional and idempotent).
