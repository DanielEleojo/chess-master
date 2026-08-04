---
title: Selftest crashes on direct load — renders before data arrives
type: task
status: open
assignee:
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
