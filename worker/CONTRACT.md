# Sync API contract (worker <-> client)

Shared reference so the Worker backend and the React client can be built in
parallel without needing each other's code.

## Data shape held server-side (KV)

```ts
type KidId = 'alex' | 'sam'
interface Task { id: string; section: string; label: string; kids: KidId[]; amt: number }
type ChecksForKid = Record<string, 1> // taskId -> 1
type ChecksMap = Record<string, Partial<Record<KidId, ChecksForKid>>> // dateISO -> kid -> checks
type PaidMap = Record<string, true> // mondayISO -> paid

interface SyncedData {
  rate: number
  tasks: Task[]
  checks: ChecksMap
  paid: PaidMap
}
```

Note: `pin` and `sound` from the old local-storage `AppData` shape are GONE from
the synced data. `pin` no longer exists anywhere (the link is the credential).
`sound` becomes a local-only, per-device client preference (localStorage on
that device), never sent to or read from the server.

KV stores one JSON value under key `state`: `{ rev: number, data: SyncedData }`.

## Roles

Four tokens, set as Worker secrets: `ALEX_TOKEN`, `SAM_TOKEN`, `PARENT_TOKEN`,
`PARTNER_TOKEN`. `PARENT_TOKEN` and `PARTNER_TOKEN` both resolve to role
`admin` — two parents, two separate links, same permission set. Role is
whichever token matches (constant-time compare). No token match = no role =
401/404.

## Ops (mutations)

Each op is `{ t: <name>, ...payload }`. `POST /api/mutate` body is
`{ rev: number, ops: Op[] }` — apply in order, all-or-nothing (if any op is
disallowed or invalid, reject the whole batch, no partial apply).

| op | payload | allowed roles |
|---|---|---|
| `toggleCheck` | `{ date, kid, taskId }` | `alex` only if `kid==='alex'`; `sam` only if `kid==='sam'`; `admin` any |
| `setTaskLabel` | `{ taskId, label }` | admin |
| `setTaskAmt` | `{ taskId, amt }` | admin |
| `toggleTaskKid` | `{ taskId, kid }` | admin |
| `addTask` | `{ section }` | admin (server generates id, label "New task", kids: both, amt: current rate) |
| `deleteTask` | `{ taskId }` | admin |
| `togglePaid` | `{ mon }` | admin |
| `setRate` | `{ rate }` | admin |
| `applyRateAll` | `{}` | admin (sets every task's amt to current rate) |
| `reset` | `{}` | admin (re-seeds clean: real default tasks, empty checks/paid) |

## Endpoints

- `GET /api/state` — header `x-checklist-token`. 200 `{ rev, role, data }` | 401 `{ error: 'not_authorised' }`
- `POST /api/mutate` — header token, JSON body `{ rev, ops }`.
  - 200 `{ rev, role, data }` (all ops applied)
  - 409 `{ error: 'stale', rev, data }` — client's `rev` didn't match current; client should adopt the returned `rev`/`data` and retry its ops once
  - 403 `{ error: 'not_allowed', op }` — a role tried an op it can't do
  - 400 `{ error: 'bad_json' | 'no_ops' | 'too_many_ops' | 'too_large' }`
  - 401 `{ error: 'not_authorised' }`
- `GET /<token>` — serves the built `index.html` if the token matches any role. Bare `/` or an unrecognized token → a small "not found" HTML page (no hint whether the token was close), same spirit as the grocery app. `x-robots-tag: noindex, nofollow` + `referrer-policy: no-referrer` on the served page.
- Static asset paths (`/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/workbox-*.js`, `/logo.png`, `/pwa-192.png`, `/pwa-512.png`) — served directly via the Workers `assets` binding, no token required (they contain nothing sensitive).

## Client behavior (for reference — the client agent/session owns this side)

- Token read once from `location.pathname` on load, kept in memory, sent as
  `x-checklist-token` on every request.
- Poll `GET /api/state` every 15s (paused when `document.hidden`, resumed on
  `visibilitychange` with an immediate refetch), adopt new `rev`/`data` if the
  rev changed.
- Every mutation is optimistic-ish: send immediately, adopt the server's
  returned state on success. On 409, adopt the returned fresh state/rev and
  retry the same ops once. On any other failure, show an inline error and
  leave state as last-known-good (no offline queueing — connectivity is
  required, per product decision).
