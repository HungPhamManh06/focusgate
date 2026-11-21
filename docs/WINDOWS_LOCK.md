# Windows App Lock

Status: Phase 0 PoC **built and executed** on Windows 11 (build 10.0.26300) with
.NET 10.0.400, not elevated, per-user session.

## 1. What Windows allows (user mode)

| Mechanism | Capability | Limits |
|---|---|---|
| `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` | Immediate notification when the foreground window changes | Delivered only while the installing thread pumps messages; does not fire for secure desktop/UAC |
| Process enumeration (`Process.GetProcesses`, window handles) | Identify interactive processes and titles | Protected/elevated processes may hide identity; UWP apps are hosted by `ApplicationFrameHost.exe` |
| `ShowWindow(hwnd, SW_MINIMIZE)` | Minimize another process's window | Needs a window handle; UIPI may block cross-integrity sends; trivial to restore |
| `Process.Kill()` | Terminate a process owned by the same user | Requires `PROCESS_TERMINATE`; cannot terminate higher-integrity processes without elevation; destructive |
| `TerminateThread`/suspend APIs | Suspend a process | Suspension via documented APIs is not available; undocumented `NtSuspendProcess` is out of scope |
| Topmost WinForms overlay | Visual block screen | Alt+F4/close; not tamper-proof; must avoid focus loops |
| AppLocker / WDAC | Real policy enforcement | Organisation-managed devices, admin deployment, not a personal app feature |
| Kernel minifilter / driver | Strongest enforcement | Out of scope: signing, stability, security review, and policy risk |
| Windows Service | Runs before login, survives logoff | Cannot show UI in the user session by design; needs IPC to a per-user agent |

**Conclusion:** a per-user agent can make entertainment apps *inconvenient* to
use (detect, minimize/overlay/terminate) but cannot promise an unbreakable lock
on a machine the user administers. That is Personal Strict Mode.

## 2. Phase 0 PoC design

```
SetWinEventHook(EVENT_SYSTEM_FOREGROUND) ─┐
                                          ├─► ForegroundApp (pid, exe, AUMID, title)
500 ms polling fallback ──────────────────┘            │
                                                       ▼
                                             EnforcementEngine (pure)
                                                       │
                          ┌────────────┬───────────────┼──────────────┐
                          ▼            ▼               ▼              ▼
                        log        minimize        terminate       overlay
                                                       │
                                                       ▼
                                              SQLite usage log
```

Files under `apps/windows-agent/src/FocusGate.Agent.Poc`:

- `Monitors/ForegroundWindowMonitor.cs` – WinEvent hook + polling fallback,
  records real OS→handler latency.
- `Monitors/WindowInspector.cs` – resolves the hosted process and AUMID for UWP
  apps (`ApplicationFrameHost`).
- `Monitors/ProcessMonitor.cs` – interactive process discovery only.
- `Services/EnforcementEngine.cs` – allowlist-first decision logic, no side
  effects.
- `Services/SqliteEventStore.cs` – WAL SQLite event log.
- `Services/SelfTest.cs` – capability probe used for this report.
- `UI/BlockOverlayForm.cs` – full-screen, topmost block screen.
- `poc-policy.json` – starter policy (Discord, Steam, Spotify, … plus allowlist).

Modes:

```bash
dotnet run --project src/FocusGate.Agent.Poc -- --selftest
dotnet run --project src/FocusGate.Agent.Poc -- --list
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce log
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce minimize
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce overlay
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce terminate
```

Default is **log only**; the PoC never touches another app unless `--enforce` is
given explicitly.

## 3. Measured results (this machine)

| Check | Result | Evidence |
|---|---|---|
| Foreground window resolved | PASS | `Freebuff (pid 16368)`, title read |
| Foreground event hook | PASS | `SetWinEventHook` installed in a message pump |
| Process enumeration | PASS | 6 interactive processes in **18 ms** |
| Window enforcement | PASS | `ShowWindow(SW_MINIMIZE)` on a separate PoC process: accepted + iconified |
| Process control rights | PASS | `PROCESS_TERMINATE` and thread suspend handles opened on a same-user child |
| SQLite local log | PASS | schema created, row written/read |
| UWP AUMID | SKIP | foreground app was not a Store app at probe time |
| Elevation | SKIP | not elevated (expected; documented) |
| Live monitor (8 s) | PASS | 1 observation, 1 row stored, decision+apply **1.04 ms** |

The probe was **not** run elevated. Consequently, the report does not claim
control over elevated or protected apps.

## 4. Production agent architecture (Phase 4)

- **Per-user tray application** (`WinExe`, single instance, autostart via
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` or a per-user scheduled
  task). It shows status, permission problems and the block overlay.
- **SQLite** in `%LOCALAPPDATA%\FocusGate\agent.db` (WAL).
- **Credential storage:** Windows DPAPI `ProtectedData.Protect(..., DataProtectionScope.CurrentUser)`
  for the device refresh token; never plaintext, never in logs.
- **Watchdog:** a per-user scheduled task restarts the agent if it exits; this is
  visible to the user and does not require admin rights.
- **Optional Windows service:** only if policy updates must be fetched before
  login; it must never run arbitrary commands and communicates with the tray app
  via a limited named pipe.
- **Backend trust:** the agent pulls policy snapshots and pushes aggregated
  usage. It never executes a server-supplied command line. Device revocation
  stops all access.
- **Update signing:** MSIX/authenticode signing in Phase 5.

## 5. Bypass and failure matrix

| # | Bypass | Effect | Mitigation / honesty |
|---|---|---|---|
| 1 | End task in Task Manager | Agent stops | Watchdog restart; show "protection off"; no unbreakable claim |
| 2 | Kill via elevated Task Manager | Same | Cannot prevent without admin policy |
| 3 | Run app elevated | Lower-integrity agent cannot kill/minimize reliably | Document; managed mode uses WDAC/AppLocker |
| 4 | Rename `discord.exe` | Policy miss | Match AUMID/hash where possible; user re-select |
| 5 | Portable/browser versions | Process is `chrome.exe` | Block browser process is too destructive; offer extension/DNS in future |
| 6 | UWP app | Process is `ApplicationFrameHost` | Resolve hosted pid + AUMID (implemented) |
| 7 | Fullscreen exclusive / secure desktop | Hook may not fire | Polling fallback; UAC cannot be covered |
| 8 | Second Windows user / RDP / VM | Separate session | Per-user agent per session; document |
| 9 | Safe mode | Autostart disabled | Cannot prevent; document |
| 10 | Clock change | Local grant cache confusion | Server expiry authoritative; use monotonic elapsed time for session checks |
| 11 | Restore minimized window | Block bypassed if only minimize | Prefer overlay or terminate; minimize is a soft mode |
| 12 | Alt+F4 the overlay | Visual block gone | Overlay is friction, not security |
| 13 | Network blocked | Policy stale | Cached signed policy with expiry; show "policy stale" |
| 14 | Tampering with local DB | Usage history altered | Server is authoritative for rewards; local DB is cache/log |

## 6. Security requirements for the agent

- Only observe processes in the user's policy plus the current foreground app.
- Never capture window contents, keystrokes or clipboard.
- No remote shell, no arbitrary file execution, no PowerShell from backend.
- Validate every policy payload (schema, allowed actions, max rule count).
- Rate-limit and sign policy updates; reject downgrades without a version bump.
- Keep an append-only local audit of decisions; redact titles before upload
  (titles are only needed locally for debugging and must not leave the device by
  default).

## 7. Phase 4 test plan

1. Block latency: launch 20 times, measure foreground → visible block, p50/p95.
2. Minimize, overlay and terminate modes against Discord, Steam, Spotify and a
   UWP app.
3. Restart agent, logoff/logon, reboot.
4. Permission/status: policy missing, DB locked, network offline, revoked device.
5. Elevated target app (expected: documented failure).
6. Memory/CPU over 8 hours idle and 2 hours active.
7. False-positive review: only selected apps, allowlist respected.
8. Uninstall/upgrade leaves no plaintext credentials.
