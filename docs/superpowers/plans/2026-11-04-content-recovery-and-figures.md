# Content recovery and private PDF figures implementation plan

> **For agentic workers:** Use test-driven-development per task; coordinator alone deploys.

**Goal:** Recover stalled intake without a terminal and let the administrator turn a private
embedded PDF figure into a separately reviewed image publication.

**Architecture:** Supabase Cron mints expiring single-use sweep capabilities; a dedicated Edge
Function can only wake the existing analysis queue. Existing capability-scoped PDF jobs upload
original image binaries privately. The review panel creates a distinct image draft from a chosen
figure; the existing teacher-controlled publisher routes it to the topic and global library.

**Tech stack:** Existing PostgreSQL/pg_net/pg_cron, Deno, PyMuPDF, vanilla JS, GitHub Actions.

**Spec:** `docs/AGENTIC_CONTENT.md`, `docs/PROJECT_STATE.md`, approved continuation request.

## Global constraints

- No model/service credentials in GitHub, no public source artifacts, no automatic publication.
- Private Harrison figures cannot be published publicly; derived images start with unknown rights.
- Preserve existing branches, dirty work, teacher edits, provenance and completed generation chunks.
- Dates displayed to users remain Solar Hijri and Asia/Tehran; persisted timestamps are UTC.

## Review focus

- Capability replay/expiration and unauthenticated/ordinary-user requests must fail closed.
- Provider quota errors back off; dead jobs recover without reopening rejected/published drafts.
- Corrupt/oversized images and wrong-page/other-source capabilities cannot upload arbitrary assets.
- Figure selection must not overwrite the parent PDF lesson or inherit scientific approval.
- Source rights, caption and topic must survive publication in both topic and library.

## Task 1 — recoverable intake sweeper (coordinator)

Files: `backend/supabase/content_queue_sweep.sql`,
`backend/supabase/functions/intmed-content-sweep/index.ts`,
`scripts/content_queue_sweep_test.mjs`, `scripts/content_queue_sweep_sql_test.mjs`.

- [ ] Write/run failing handler and SQL behavior tests for one-use capabilities, locks, backoff,
  empty-queue no-op, rejected-source reconciliation and abandoned-processing recovery.
- [ ] Implement service-only state/RPCs, a private Cron requester, and a bounded sweep handler.
- [ ] Run tests, deploy with scheduling disabled, verify auth/grants, then enable and observe.
- [ ] Publish a coherent checkpoint and wait for full release checks.

## Task 2 — original private PDF figures (extraction lane)

Files: `scripts/process_content_job.py`, `backend/supabase/content_figures.sql`,
`backend/supabase/functions/intmed-content-jobs/{index,figures}.ts`, matching tests.

- [ ] Red/green tests: original JPEG/PNG bytes, masks, dimensions/hash, bounded upload, idempotency.
- [ ] Add private figure records and capability-scoped binary upload; retain parser provenance.
- [ ] Add atomic `intmed_materialize_figure(p_figure_id,p_reviewer_id,p_expected_revision)`.
- [ ] Verify schema/security and a source-backed extraction without publishing content.

## Task 3 — figure review/routing (review lane)

Files: `backend/supabase/functions/intmed-content-review/index.ts`,
`docs/js/intmed-content-review.js`, `docs/content-review.css`, matching browser/handler tests.

- [ ] Red/green tests: admin-only signed previews, dirty/CAS safeguards, separate image draft.
- [ ] Add expandable previews and selection; reuse category/topic search and image-kind picker.
- [ ] Require explicit derived-image rights; keep the parent and final teacher gate unchanged.
- [ ] Coordinator integrates lanes, versions assets, runs full CI and verifies public release.

## Explicitly later

Multi-topic splitting, independent clinical review/model comparison, external email credentials,
paid-content isolation and native-store release remain separate tasks. Nothing here claims clinical
approval or enables a new paid provider. Rollback sweep by disabling its singleton state and
unscheduling `intmed-content-queue-sweep`; source/draft records are retained.
