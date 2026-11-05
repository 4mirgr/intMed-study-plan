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
- The review form has no manual usage-rights selector/explanation step. Keep existing source/license
  metadata server-side; leave unknown provenance unset rather than inventing authorship. Retain
  explicit publication confirmation and the existing block on known private Harrison assets.
- Login/network recovery must bound the entire response body, not only headers. A transient profile
  read failure retains the tab-scoped session and offers verification retry without another password
  exchange; inactive/rejected accounts stay gated. Public navigation loading retries independently
  of private synchronization and must show an actionable error rather than an empty endless spinner.

## Hematology intake checkpoint (2026-11-04)

- Current public hosting is the personal-site Cloudflare Pages assembly at `/intmed/`, not the
  domain root. Its `gerami-website/deploy/projects.json` pins an exact IntMed commit; a GitHub Pages
  release alone does not update that assembly. Review/test upstream and bump only the IntMed pin
  when publishing; never change DNS or the unrelated AUS pin as part of content delivery.
- Nine supplied PDFs (62 pages; 213 source questions) integrated into eight hematology topics.
  CML/CLL were revised without duplicating their existing banks; AML/ALL, aplastic/MDS and lymphoma
  were expanded, and a separate PV/ET/PMF topic was added. New content remains teacher-review draft.
- Net additions: 50 lesson sections, 71 flashcards, 125 MCQs, 10 KF/PMP cases and eight original
  teaching algorithms. Full-page scans/private originals are not included in the public repository.
- Source mappings, key contradictions/exclusions, supplemental citations and remaining human-review
  scope are in [the compact intake handoff](content-intake-heme-2026-11-04.md). Do not silently restore
  ambiguous historical keys or claim these question banks are authenticated complete 2025 chapters.

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
- The Telegram 30-item safety cap counts only sources still awaiting or undergoing machine analysis.
  Once a draft is produced the source becomes `accepted`; human review/publication status is tracked
  separately and can no longer leave the ingest queue falsely full.
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
  inputs were recovered from the paid-provider failures and converted locally to review drafts.
- A zero-cost LM Studio runner now uses an admin session, macOS Keychain, atomic five-minute leases,
  heartbeats and short-lived private-inbox URLs. It processes Qwen/Gemma/DeepSeek sequentially for
  an 8 GB machine and never receives `service_role`. It submits `draft_ready` review drafts; it no
  longer claims publication jobs.
- The admin dashboard includes a private content-review inbox for Telegram/online drafts. The
  manager-facing flow is intentionally short: preview the prepared lesson/questions/flashcards,
  search or choose category then topic, choose the content kind, and approve publication. Technical
  evidence/warnings and automatic rights metadata remain stored for audit but no longer clutter the
  routing form. A separate «انتشار روی سایت» action
  dispatches a short-lived, one-draft capability to GitHub Actions, which creates/updates canonical
  content, validates/builds it, then commits and pushes. The localhost runner is now limited to
  extraction and draft generation; a dirty or offline Mac cannot block an approved publication.
  The browser and server still cannot bypass the teacher gate.
- Study-state synchronization now treats a gateway HTTP 405 on PATCH as retryable and falls back to
  the fixed direct project origin, preventing notes/highlights from remaining in an error state when
  an older gateway route handles login but rejects state updates.
- Publication invariants: an explicit admin publish request is dispatched to a serialized GitHub
  Actions workflow and its durable status is reflected in the review panel. Every visual target
  (`image`, `clinical`, `radiology`, `pathology`, `PBS`,
  `algorithm`, `table`, `tracing`, `chart`) is stored in the selected topic's canonical `images`
  collection, so it appears both in that lesson's «تصاویر مهم» tab and in the global library. The
  reviewed title is the caption and the reviewed golden summary is the visible note under the image.
- Controlled review defaults to an existing taxonomy topic. The new-topic form stays hidden and is
  offered only after a typed destination has no exact match; it is an explicit fallback, never a
  required field. From `draft_ready`, the admin can use one «تأیید و انتشار روی سایت» action, which
  records the scientific approval and dispatches publication while the dialog follows the result.
  Local Finder files and unrelated working-tree changes cannot affect the cloud publisher.
- A planned topic may already exist in taxonomy before its canonical `data.json` exists. The first
  controlled publication now materializes the empty canonical package automatically and then runs the
  normal validate/build/check gates; it no longer fails with «فایل canonical مبحث مقصد پیدا نشد».
- macOS setup/watch remains responsible only for the zero-cost LM Studio analysis queue. Cloud
  publication uses stable item IDs, so an explicitly retried workflow remains idempotent.
- The content worker now prefers Gemini for online multimodal analysis and can read typed text,
  images/handwriting and PDFs up to the Telegram inbox limit, producing Persian lesson sections,
  flashcards, MCQs and KF/PMP drafts. OpenAI is used only when explicitly selected; user activity alerts do
  not call either model. LM Studio is therefore optional, not part of the normal cloud path.

- Multimodal PDF analysis now records page-by-page extraction (including page count and unreadable-page flags), uses a PDF-sized output budget, and feeds the full extracted evidence into a second-stage generator. Generated lessons contain real titled sections, paragraphs and key points; publication writes those sections plus selected MCQ/flashcard/KF outputs into the chosen canonical topic. Dynamic topic/index payloads are network-first with exact versioned cache keys, so a successful publication is no longer hidden behind an older PWA cache.

## Open work, in priority order

### Content-factory revision checkpoint (2026-11-03)

- Owner approved the staged revision after the architecture audit. Keep Telegram intake. Do not
  infer medical correctness or end-to-end completeness from a green build.
- Implemented: model-reported page inventory checks and reusable-extraction quality flags;
  lesson-first generation with a persisted lesson checkpoint; page-linked assessments; independent
  extraction/lesson/assessment model configuration preserving existing defaults; readable editable
  artifact review with optimistic revision checks; publication waits for matching live manifest
  and topic bytes. Authored content still requires the teacher's final approval.
- Parser-verified pages, native extraction/selective OCR and durable resumable jobs were completed
  in the next checkpoint below; this historical list must not reopen those shipped tasks.
- Still requiring acceptance: multi-topic routing; independent clinical
  checking; comparison of typed, scanned/handwritten and visual/table-heavy files against teacher
  references. Old drafts without a parser-verified page map need explicit reanalysis. A verified
  page count proves neither accurate OCR nor clinical correctness.

### Durable content processing (2026-11-03)

- Added service-only `intmed_content_jobs`, capability-scoped read-only GitHub processing workflow,
  actual PDF parsing with PyMuPDF, selective OCR for nonblank unreadable pages, cached OCR results,
  parser-verified page inventory and preserved source text. Source files and text stay private;
  workflows do not receive a model API key or Supabase service key and publish no source artifacts.
- Generation now runs independently of the review browser, in bounded chunks of four pages or
  12,000 characters. Every completed chunk is persisted. Retry resumes the same run and avoids
  redoing completed chunks; lesson completion precedes its assessments. The admin panel resumes
  progress polling on reopening and prevents concurrent edits/publication while a job is active.
- Embedded original figure binaries now have private bounded storage, parser-runner inventory
  binding, integrity checks and source-scoped admin previews. Selecting one creates an independent
  unapproved image draft; caption/type/topic use the existing teacher-controlled publisher
  and therefore reach both topic and library. Unknown rights never silently become authored.
- Old PDF drafts support image-only backfill without OCR/models or changing existing lesson,
  assessments, status or revision. Limits: 80 images, 5 MiB each, 30 MiB per PDF. Original embedded
  JPEG/PNG are preserved; masks/unsupported formats are composed/converted losslessly. Vector-only
  drawings and whole scanned-page crop selection remain separate work.
- Still open: multi-topic splitting/routing within one file; independent scientific/assessment
  review; representative model comparison with
  teacher-approved reference output. OCR correctness and scientific quality require separate
  acceptance; parser-verified page counts alone prove neither.
- Live extraction smoke passed on the existing osteoporosis PDF: 15 actual pages, 68,060 native
  text characters, 19 embedded-figure records, no OCR required. A diagnostic run left the
  published draft unchanged; a subsequent explicit pilot reopened only its review draft and
  completed native extraction plus topic routing. The public lesson remains unchanged pending
  teacher review of the rebuilt draft.
- Fixed a production-only legacy handoff restriction in `claim_intmed_content_ingest`: explicit
  service/admin requests can resume processing/error/draft-ready sources, while ordinary polls
  cannot reopen completed drafts and published drafts remain excluded.
- Live generation pilot also completed through the capability-scoped cloud workflow: all 28
  chunks (seven per output) persisted; 16 lesson sections, 46 flashcards, 19 MCQs and 33 KF draft
  prompts are available in the osteoporosis review draft. These are generated drafts, not a
  clinical-quality benchmark or teacher approval, and were not automatically published.
- RTL extraction now retains PDF creator order rather than imposing left-to-right spatial
  sorting; numeric/dose sequences are never reversed. Source layout still needs comparison
  with the original. A configured active cloud provider prevents old laptop watchers from
  claiming new inbox work; explicit maintenance/manual mode preserves the local fallback.

### P0 — release correctness

- Added six visually inspected, openly licensed Commons PBS originals to the matching anemia/CML
  topics and generated PBS library filter. Persian captions retain diagnostic limitations and draft
  review status; creator/source/license/change notices are visible. No ASH public-reposting permission
  is assumed. The curated import manifest records visual QA; originals stay byte-for-byte unchanged.
- Fixed Telegram burst lost-wakeup: normal intake and retry wake the queue, not only one requested
  source. The winning serialized worker batches/self-chains. Exact PDF duplicates can reuse an
  unapproved parser-verified draft before extraction dispatch when routing hints also match, without
  repeating model calls or inheriting clinical approval. Rejected inputs are never auto-reopened.
- Queue recovery now has a disabled-by-default service-only state machine and a dedicated Edge
  endpoint accepting two-minute single-use sweep capabilities. The private Cron requester stores
  no permanent API credential, coalesces ticks, protects teacher decisions/active jobs and backs off
  provider failures by 15/30/60 minutes, shared with event-triggered and chained workers. It is now
  enabled in production every five minutes; initial dispatch and callback were observed. Empty
  queues make no model call. Rejected sources are reconciled out of the active count; content and
  human review records are retained. Invalid-token probes are denied and ordinary users cannot
  read sweep state or consume/defer its capabilities.
- Live image-only backfill passed on the existing osteoporosis PDF: 15 pages, 19 private originals,
  zero OCR/model calls, zero failed uploads. Parent draft status, revision (35) and content hash
  stayed unchanged. This prepares teacher previews, not public rights or scientific approval.
- Live queue recovery exposed a separate malformed structured-output request for plain Telegram
  text. The same failed source became draft-ready after removing redundant model transcription;
  original text is retained byte-for-byte as `plain_text`, never labeled parser-verified PDF pages.
  Image inputs have a one-page report bound; native parsed PDFs are unchanged. Old unreviewed
  text failures were explicitly requeued after that successful same-source comparison. Safe
  diagnostic categories remain; temporary raw-provider-message persistence was removed.
- Recovery acceptance snapshot: all 11 previously stranded eligible sources reached draft-ready
  review (10 plain-text sources plus one reusable PDF). Machine intake has no pending/processing/
  error rows; 69 accepted and two explicitly rejected sources remain. The 16 published drafts and
  nine previously approved drafts were unchanged; nothing was automatically published.

- Scientific findings now have a readable review panel, safe evidence links and explicit
  administrator resolution notes/history. Both approval and publication reject unresolved blocking
  findings server-side. Editing artifacts does not silently resolve findings; resolving a finding
  does not approve the entire draft. The osteoporosis pilot still needs teacher review.
- The global library viewer now displays creator, license, source links and modification notes,
  as well as a draft-caption warning. Source metadata must remain visible outside topic pages too.

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
- Validate normalized message backfill in production and retire the legacy fallback only after
  acceptance; conversation RPCs are already the primary UI (see baseline). Realtime/native push
  remain later work, not prerequisites for the current adaptive foreground polling.
- The twelve preserved Telegram inputs were processed locally into review drafts. Triage
  these in the admin inbox, clinically review approved candidates, and integrate only source-backed
  material through the canonical content pipeline. Keep port 1234 loopback-only.

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

### Gallery browsing — 2026-11-06 (Tehran)

- Fixed the real PBS pagination symptom: `.library-more` forced display even when the button had `hidden`, leaving the previous "48 more" label visible below a short filtered list. Tests cover hidden short lists and actual 48-to-96 expansion without duplicates.
- Image cards show contained source images; structured algorithms/tables lazily show a small view of the actual source content rather than a generic icon. Topic requests share in-flight promises; no medical content or generated catalogs were rewritten.
- Viewer previous/next controls and ArrowLeft/ArrowRight browse a stable snapshot of the complete active filtered list. Bounds stop navigation, recent/hash entries outside the current filter remain single-entry viewers, editing/modifier keys are not intercepted, and Escape clears the viewer hash.
- Focused browser tests cover source-cell previews, filter isolation, native Escape, keyboard/button navigation and editable-field protection; original attribution, favorites and topic deep links remain intact.

### Background publication checkpoint — 2026-11-05 (Tehran)

- Live integration found the server PAT lacks host Contents write (`hosting_permission_required`). Owner action: add only gerami-website to the existing selected-repository token. Do not claim unattended hosting is enabled until that permission is corrected.
- A second verified cause was Cloudflare BIC blocking the default Python verifier UA. Public verification uses explicit JSON Accept and an identified IntMed-Publisher client; BIC/auth rules remain enabled. Production diagnostics exercise exact public-byte verification and expose phase/status, not private bodies.

- Root cause verified in real workflow logs: study content committed successfully, but the actual host IntMed pin did not advance. The dialog's separate 180-second polling timeout incorrectly suggested refreshing/staying open.
- Accepted publication now closes the review dialog. Server-derived publication statuses refresh separately every eight seconds and cannot overwrite another open draft's edits. Browser closure does not own or cancel the publisher.
- A service-only database FIFO selects one active cloud publisher, completion starts the next, and the existing five-minute private sweep recovers queued work independently of provider backoff. Per-draft GitHub concurrency avoids losing earlier pending runs.
- Capability-scoped host deployment updates only the IntMed pin in gerami-website, preserving AUS and all unrelated fields with file-SHA concurrency checks. Actual public manifest/payload verification still gates published status. Host write permission of the server-held PAT must be verified; public GET access is not sufficient.
- Dispatch/stale failures remain visible and retryable, not deleted or silently marked published. Runbook: docs/BACKGROUND_PUBLICATION.md. Content-analysis/provider behavior is deliberately unchanged in this publication fix.

### Question-first checkpoint — 2026-11-05 (Tehran)

- Owner approved structured question-bank preparation, original MCQ preservation, answer-based lessons/cards and withholding uncertain keys. A cached, revision-safe internal source_questions stage now precedes durable generation. Review UI offers auto/question-bank/prose modes, original-question evidence, readable previews and editable generated artifacts; close/Escape/navigation protect unsaved edits.
- Explicit original keys, question/answer pages and sourceQuestionId/origin survive publication. A summary/outline is not a lesson for question-bank drafts. Source-only MCQ imports avoid an additional lesson-generation call. Prepared source evidence is not yet independently clinically verified; teacher approval remains required.
- Message badges refresh every 8 seconds on visible online pages, without study-save starvation or replacing pending legacy edits. This is message notification polling, not automatic refresh of every admin signup/statistics counter.
- Weekly deterministic image QA now checks canonical local assets, confinement (including symlinks), PNG/JPEG/GIF dimensions, byte/hash consistency and provenance. No new model loop or provider was activated. Existing content has a substantial warning/review backlog; findings are not automatic fixes.
- **Still pending:** representative real-file benchmark and clinical verification, multi-topic mapping, correcting uncertain original keys from the panel, revision-bound Telegram approval/publication and Telegram audit-report delivery, budgeted source research, and the cross-repository public hosting-pin bridge below. No real draft was approved or published for testing.

### Review destination and mounted publication — 2026-11-05 (Tehran)

- Public taxonomy, manifest and topic payload consumers must use `/intmed/content/`, not root `/content/`. Review, worker, Telegram and local runner were corrected; API origins/CORS remain unchanged.
- The review dialog now selects an existing destination only; the redundant new-topic form is removed. Legacy new-topic drafts require an explicit existing selection, never silent topic creation.
- Raw extraction is source evidence, not polished teaching output. Publishing does not rewrite lesson/question prose; inspect and edit generated artifacts first. The legacy summary/outline fallback remains and must not be mistaken for a generated lesson.
- **Unresolved publication bridge:** the cloud publisher pushes the study repository, but the actual Cloudflare host uses the pinned IntMed commit in `4mirgr/gerami-website/deploy/projects.json`. Future button-driven publication needs a reviewed, least-privilege cross-repository pin-update mechanism. Mounted freshness URLs alone do not complete that bridge. Do not mark a draft published until its public payload matches.

“Done” means source changed, focused tests passed, generated files are current, a coherent commit is
on the remote branch, GitHub Actions/deployment completed, and remaining external blockers are
written above. Local-only edits or a green Pages job with a failed validation job are not done.
