# IntMed project state

This is the short, canonical handoff. Update it in the same commit when a decision, production
dependency, or backlog item changes. Do not copy chat transcripts here.

## Product decisions

- The coordinator owns scope, integration, tests, commits, pushes, and production checks.
  Worker agents get non-overlapping files and return diffs/test evidence only.
- Dates shown to users are Solar Hijri and `Asia/Tehran`; persisted instants remain ISO/UTC.
- IntMed signups get immediate app approval, while Supabase verified email and
  rejected/suspended-account checks remain enforced.
- An untrusted/public browser is the default: browser-session persistence plus inactivity and
  absolute expiry. A future native app must use OS secure storage, not Web Storage.
- Public educational samples may live in the static site. Paid lessons and entitlements must
  move behind an authenticated API before subscriptions launch.
- Medical content is AI-assisted, source-traceable, and always marked draft until teacher review.

## Shipped baseline (2026-10-23)

- Persian/Tehran dashboard and planning dates, Saturday-first week, Google Calendar and ICS.
- Calendar-email Edge Function and delivery ledger; production email is blocked until
  `RESEND_API_KEY` and a verified `NEWSLETTER_FROM` are configured in Supabase.
- Immediate IntMed signup approval, safer session expiry, duplicate-email/recovery flow, signup
  Telegram notification, newsletter server scaffolding.
- Separate account/message entry points and notification badges (polling MVP), personal notebook,
  highlights with recoloring, dashboard depth/motion and responsive header improvements.
- Production Supabase migrations/functions were installed; Telegram secret exists. The GitHub
  branch is `claude/quirky-ride-mavb6b`. Confirm the branch and current remote SHA before edits.

## Open work, in priority order

### P0 — release correctness

- Keep GitHub validation/deployment green; investigate any failing SQL/browser test before calling
  a release complete.
- Configure and end-to-end test Resend sender, calendar email, newsletter test/send/unsubscribe.
- Test signup, login, recovery, account/messages, calendar and email on real iOS/Android networks.
- Recheck Supabase redirect allow-list, Auth email templates, CSP, rate limits and abuse protection.

### P1 — content factory and learning product

- Run the PDF workflow in `AGENTIC_CONTENT.md` for each supplied chapter; complete lung neoplasms
  and every earlier draft with teacher clinical review.
- Add a first-class image/algorithm library reachable from the dashboard: category/topic/source
  filters, Persian search, thumbnails, full-resolution viewer, stable deep links and favorites.
- Re-extract low-quality PDF figures from original embedded streams or render the figure region at
  high DPI; record page, source, copyright and visual QA. Never upscale a bad thumbnail as a fix.
- Add a scheduled content audit that opens issues/reports; it must never silently rewrite medical
  claims. Use `scripts/content_quality_audit.py` as the deterministic first stage.
- Normalize tickets into conversation/message tables, add per-recipient read cursors, Supabase
  Realtime and later native push. Current JSONB polling/badges are an MVP.
- Publish a user-facing changelog/news panel with dated, plain-Persian release notes.

### P1 — paid/mobile foundation

- Define subscription products, entitlement service, server-side receipt verification,
  idempotency, refunds/revocation and audit logs. Never trust a client purchase flag.
- Move protected content/assets off public GitHub Pages before selling access; enforce entitlement
  server-side with signed/short-lived delivery.
- Stabilize the web API/PWA, then build an Android shell (Capacitor is the shortest migration path)
  with secure storage, deep links, notifications, offline rules and separate Bazaar/Myket flavors.
- At publication time recheck the current official Bazaar/Myket contracts and IAP rules, Enamad,
  tax obligations, privacy/terms/refund policy, and medical-education disclaimer. Store terms and
  fees change; do not encode remembered percentages.
- Introduce a branded `.ir` domain and transactional sender only after DNS ownership; configure
  SPF, DKIM and DMARC, then migrate links/redirects/CORS gradually.

### P2 — scalability and operations

- Replace admin-wide client aggregation and growing JSONB state with normalized event/summary
  tables; add indexes, pagination, retention and observability before large growth.
- Add staging, migration rollback notes, backup/restore drills, error tracking and load tests.
- Establish accessibility/performance budgets and reduced-motion/low-end-device regression tests.
- Finish Telegram operational setup/retry UX and decide which events merit notification.

## Completion rule

“Done” means source changed, focused tests passed, generated files are current, a coherent commit is
on the remote branch, GitHub Actions/deployment completed, and remaining external blockers are
written above. Local-only edits or a green Pages job with a failed validation job are not done.
