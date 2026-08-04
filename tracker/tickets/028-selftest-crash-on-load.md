---
title: Selftest crashes on direct load — renders before data arrives
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

Discovered while verifying ticket 024: navigating straight to `?selftest=1`
blanks the whole app. `App`'s `mode` is fixed from the URL at mount
(`src/App.tsx`), so a direct load of `?selftest=1` renders `<Selftest>`
before its `lines`/`traps`/`tactics` props arrive from `App`'s async
`/data/repertoire.pgn` fetch. `Selftest.tsx`'s effect runs immediately
against the still-empty `lines` array; `makeDrill(lines[0])` throws
(`Cannot read properties of undefined (reading 'fen')`) with no error
boundary anywhere in the tree, so React unmounts the entire app to a blank
root rather than just the one broken mode.

100% reproducible on a fresh load — confirmed via `git stash` that it
predates every change in ticket 024, so it's unrelated to that work.

## Scope

Either gate `Selftest`'s effect on `lines.length > 0` (mirrors how the rest
of the app already waits on `state === 'ready'` before rendering), or don't
mount `<Selftest>` until `App`'s own data load finishes. An error boundary
above the mode switch in `src/main.tsx`/`src/App.tsx` would also stop a
future crash like this from blanking the entire app rather than just the
one broken mode.

## Resolution

Re-diagnosed live (`window.location.href = '?selftest=1'` against the
running dev server, root inner HTML confirmed blank, then a temporary
localStorage-writing try/catch around the effect body captured the real
stack). The `lines`/`traps`/`tactics`/`learn` race this ticket describes no
longer exists — `App.tsx`'s `state === 'loading'` gate (added in ticket 011,
after this ticket's original diagnosis) already withholds every mode,
including `selftest`, until those four are all set, and React 18 batches
that `setState` with `setState('ready')`, so `Selftest` never mounts with
empty seed data.

The actual live crash is a different race, introduced later by ticket
018/024's rating-history checks: `ratingHistory()` (`src/lib/recommend.ts`)
filters games by matching against `USER`, a module-level `let` in
`src/lib/sync.ts` set asynchronously by `App`'s `resolveChessUsername()`
effect. On a fresh `?selftest=1` load that effect hasn't resolved yet when
`Selftest`'s own effect runs, so `USER` is still `''`, every fixture game
gets filtered out, `ratingHistory` returns `{}`, and `milestone(rh)!`'s
non-null assertion throws on the null result — same end symptom (blank
root, no boundary) as originally filed, different cause.

Fixed both the concrete bug and the class of bug:

- `Selftest.tsx`: the rating-history block now saves `USER`, pins it to
  `'babadaniel'` (matching its own fixture usernames) via `setUser` before
  building `rh`, and restores it immediately after — the test no longer
  depends on `App`'s account-resolution timing at all, deterministic on any
  load order. Left the mount-gating option alone: gating on a `chessUser`
  readiness signal instead was tried first but rejected, since on a
  never-configured account (`data/settings.json` missing) `resolveChessUsername`
  blocks on `window.prompt(...)`, and a mount gate would hang the whole mode
  behind that dialog instead of just crashing — worse, not better.
- `main.tsx`: added a small class `ErrorBoundary` wrapping `<App />`, per
  this ticket's own suggestion — any future crash anywhere in the tree now
  falls back to a "Something broke — reload to retry" message instead of
  unmounting the entire app to a blank root.

Verified live: fresh `?selftest=1` load now renders the full Selftest
report (no crash, no error-boundary fallback) — 106 checks pass. `npm run
check` clean.

**Not fixed here, out of this ticket's scope**: one pre-existing,
unrelated failure surfaced by that same run — `FAIL every tactics card
walks its own solution (p:Oezqb)`, a single broken puzzle card in the
tactics deck. Unrelated to the crash-on-load bug; worth its own ticket.
