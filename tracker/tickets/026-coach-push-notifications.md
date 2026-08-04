---
title: Push notifications for the coach
type: grilling
status: open
assignee:
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
