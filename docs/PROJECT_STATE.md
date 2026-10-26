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

## Shipped baseline (2026-10-26)

- Persian/Tehran dashboard and planning dates, Saturday-first week, Google Calendar and ICS.
- Calendar-email Edge Function and delivery ledger; production email is blocked until
  `RESEND_API_KEY` and a verified `NEWSLETTER_FROM` are configured in Supabase.
- Immediate IntMed signup approval, safer session expiry, duplicate-email/recovery flow, signup
  Telegram notification, newsletter server scaffolding.
- Separate account/message entry points and notification badges with adaptive 8-second foreground
  polling (up to 60-second backoff on failure), personal notebook,
  highlights with recoloring, dashboard depth/motion and responsive header improvements.
- Production Supabase migrations/functions were installed; Telegram secret exists. The GitHub
  branch is `claude/quirky-ride-mavb6b`. Confirm the branch and current remote SHA before edits.
- A generated image/algorithm library provides Persian search, filters, full viewers, private
  favorites/recent history and stable lesson deep links for 402 current entries.
- A conservative weekly content-audit workflow publishes artifacts and maintains one deduplicated
  review issue; it cannot modify medical content.
- The secure Telegram inbox accepts authorized direct/forwarded text, PDF and images into a private
  quarantine queue. It records privacy-limited provenance and never auto-publishes content.
- Normalized conversations/messages/read cursors are now the primary message UI; a temporary
  legacy-ticket fallback remains only for old cached clients or an unavailable schema.
- The installable Persian PWA shell has an explicit offline screen and never caches Auth/API/private
  data. Production Auth now requires at least eight password characters.
- Telegram now has an inline command menu, Persian free-form topic routing, private login/activity/
  message alerts, and a serialized provider queue with recoverable retry states instead of parallel
  AI bursts. Three draft CNS-infection chapters and four original clinical algorithms are published
  in the canonical content system.
- The CNS-infection lesson now exposes separate searchable headings for meningitis, encephalitis,
  HSV/VZV/West Nile, rabies, Naegleria, post-HSV autoimmune encephalitis, brain abscess/empyema,
  septic venous thrombosis, PML/SSPE, neurocysticercosis and cerebral toxoplasmosis.
- The production login gateway is active at `api.drgerami-md.ir`; public probes return the site with
  HTTP 200 and the gateway/Worker with the expected authenticated-service response. The temporary
  same-origin `/api` experiment was removed because GitHub Pages correctly rejects POST with 405.
- Production Telegram evidence now includes two delivered login alerts and one delivered activity
  alert. The bot chat, webhook secrets and Edge Functions are installed; twelve preserved content
  inputs remain recoverable in `waiting_provider` after repeated OpenAI rate-limit responses.

## Open work, in priority order

### P0 — release correctness

- Keep GitHub validation/deployment green; investigate any failing SQL/browser test before calling
  a release complete.
- Configure and end-to-end test Resend sender, calendar email, newsletter test/send/unsubscribe.
- Test signup, login, recovery, account/messages, calendar and email on real iOS/Android networks.
- Recheck Supabase redirect allow-list, Auth email templates, CSP, rate limits and abuse protection.
- Retry the four historical pending signup alerts from the authenticated admin panel and confirm
  that new signup alerts continue to deliver automatically.

### P1 — content factory and learning product

- Run the PDF workflow in `AGENTIC_CONTENT.md` for each supplied chapter; complete lung neoplasms
  and every earlier draft with teacher clinical review.
- Re-extract low-quality PDF figures from original embedded streams or render the figure region at
  high DPI; record page, source, copyright and visual QA. Never upscale a bad thumbnail as a fix.
- Validate normalized message backfill in production, then move the UI from legacy ticket polling
  to conversation RPCs/Realtime; add native push later. Dual-write keeps the cutover reversible.
- Twelve Telegram content inputs remain preserved after `provider_rate_limited`. OpenAI credit is
  zero, so a new key alone will not fix processing. The owner approved manual mode: keep intake and
  alerts active while automatic model dispatch defaults off behind
  `INTMED_CONTENT_PROCESSING_ENABLED`. Process sources through direct chat or an authorized private
  Drive folder. Hosted free-provider fallback requires separate explicit approval of provider and
  data-handling terms and must never happen silently.
- The approved zero-cost local direction is LM Studio on the owner's 8 GB computer: Qwen3 4B as the
  primary structured drafter, Gemma E2B for a constrained Persian style pass, and DeepSeek R1
  Distill Qwen 7B only for small targeted reviews, one loaded model at a time. The secure
  admin-authenticated pull/claim/heartbeat runner is not implemented yet; do not expose port 1234
  or store a Supabase service-role key on the laptop.

### P1 — paid/mobile foundation

- Connect the entitlement foundation to official Bazaar/Myket sandbox verifiers, reconciliation,
  refunds/revocation and real products. Never trust a client purchase flag.
- Move protected content/assets off public GitHub Pages before selling access; enforce entitlement
  server-side with signed/short-lived delivery.
- Validate the new PWA install/update/offline flow, then build an Android shell (Capacitor is the shortest migration path)
  with secure storage, deep links, notifications, offline rules and separate Bazaar/Myket flavors.
- Keep the proposed localhost/PWA `offline-readonly` mode in the backlog; it is explicitly deferred
  for now and must not copy private sessions or synced account data onto shared computers.
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
- Activate and smoke-test the Telegram webhook from the admin panel after deploying its function;
  decide which future events merit notification.

## Completion rule

“Done” means source changed, focused tests passed, generated files are current, a coherent commit is
on the remote branch, GitHub Actions/deployment completed, and remaining external blockers are
written above. Local-only edits or a green Pages job with a failed validation job are not done.
