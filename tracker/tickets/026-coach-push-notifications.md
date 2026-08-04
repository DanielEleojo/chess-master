---
title: Push notifications for the coach
type: grilling
status: closed
assignee: baba
blocked-by: []
---

## Question

023: a proactive check-in that reaches Daniel outside the app, not just when
he opens it. No service worker or Notification/Push API exists in the
codebase today. The `worker/` migration to a real custom domain
(chess.meetdanielbaba.com) makes a Worker-side Cron Trigger newly possible
as the server-side send.

Open questions for the next grilling pass: permission-prompt UX (when to
ask, what if he says no), what triggers a send (same day-threshold as 024's
in-app rung, or its own), payload content (reuse `coachPitch`'s LLM phrasing
or send a plain fact), and how it interacts with the multi-account direction
hinted at in `account.ts` (per-account chess username — does each account
get its own push subscription?).

Lower priority than 024/025 — Daniel confirmed "ship the in-app nudge now,
this later."

## Resolution

Grilled to a full design, resolved in one pass since "this later" became now:

- **Trigger**: reuses `INACTIVITY_DAYS`/`recommend.ts`'s existing 5-day rung exactly — no new knob. Fires **once per threshold-crossing**, never repeats while he stays quiet (a push is an interruption, not a card he opts into by opening the app — repeating it risks getting muted at the OS level for good).
- **Payload**: a plain fact ("N days since your last session — your coach has a pick ready"), not the LLM pitch. The push is a doorbell, not the message: tapping it opens Home, where `CoachCard` already computes the real evidence-backed pitch via `pickNext` + `coachPitch`. The cron never touches Workers AI or replicates the recommender.
- **Permission ask**: a small link near `CoachCard` on Home, shown only while `Notification.permission === 'default'`. Click → request permission → subscribe. Denied → the link just stops showing; no re-ask logic, since browsers block re-prompting via JS anyway.
- **Multi-account**: free — every route already scopes data by a Cloudflare Access uid prefix in KV; the cron just discovers which prefixes exist and checks each independently.
- **Multi-device**: single subscription per account, overwritten on resubscribe — confirmed laptop-only use, so no array/cleanup for multiple simultaneous devices.
- **Schedule**: daily Cron Trigger at `0 0 * * *` UTC (~8pm EDT / 7pm EST) — fixed UTC, drifts an hour across DST twice a year, not worth compensating for.

Build ticket spawned and closed in the same pass: [029-build-coach-push-notifications.md](029-build-coach-push-notifications.md).
