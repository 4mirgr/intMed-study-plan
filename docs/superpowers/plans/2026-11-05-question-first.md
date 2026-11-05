# Question-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve original questions/answers and derive editable supported teaching content, with live notifications.
**Architecture:** Existing native extraction and durable Supabase/GitHub jobs; a cached source-question stage precedes generation. Independent UI and notification lanes own non-overlapping files under AGENTS.md.
**Tech Stack:** TypeScript Edge Functions, vanilla JS, Python job runner, VM/browser regressions.
**Spec:** docs/superpowers/specs/2026-11-05-question-first-design.md

## Global Constraints

- Preserve existing checkout and private source boundaries. No provider change, automatic medical approval, or unlimited model loop.
- Keep prose-only compatibility and revision/CAS controls; do not edit generated content files.

## Review Focus

- Answer key at the end of a file must be available to questions earlier in the file.
- Missing/contradictory answer keys cannot be inferred or feed lessons.
- Source questions split at page/chunk boundaries must not disappear silently.
- Unsaved reviewer edits and study changes survive polling and previews.
- Existing legacy drafts and plain-prose generation remain usable.

### Task 1: Structured question preparation

Files: generator index.ts, content-jobs index.ts, process_content_job.py and focused tests; local_runner.py publication guard if required.
Interface: generator `outputs:['source_questions']` internal stage; persisted `draft_json.questionBank` with version/mode/questions and source/page evidence. MCQ outputs preserve `sourceQuestionId`/`origin:'source'`.
- [ ] Write/run failing multi-page source-question extraction, evidence, withholding and cache tests.
- [ ] Implement bounded source preparation, cross-file answer context, safe derivation and durable-stage orchestration.
- [ ] Run generator, jobs, processor and publisher tests; preserve failed-attempt checkpoints.

### Task 2: Review editing and source visibility

Files: content-review.js/css, content_review_browser_test.mjs.
Interface: optional questionBank; existing generated-artifact edit/save API unchanged.
- [ ] Test source bank display, unknown answers, preview/edit and unsaved contents.
- [ ] Implement read-only original questions and usable generated preview/edit controls.
- [ ] Run focused browser and syntax checks.

### Task 3: Fresh notification badges

Files: narrow intmed-app.js message polling block + focused notification tests.
Interface: existing isolated messageCenter GET/update and unread badges.
- [ ] Reproduce polling starvation during pending study writes and reconnect delays.
- [ ] Poll visible online pages every 8 seconds, no overlap; preserve legacy pending writes.
- [ ] Run notification, backend-state, message and browser regressions.

### Task 4: Review, checkpoint and deploy

- [ ] Independently review changed interfaces and fail-closed medical behavior.
- [ ] Run content validate/check, version_assets, JS/state tests and CI.
- [ ] Commit only task files over latest remote head, deploy changed Edge Functions and pin the actual host after checks.
- [ ] Report actual completed scope and remaining automation/hosting integration honestly.

## Execution ledger

Ruling: source-first checkpoint is owner-approved; expanded perpetual research/Telegram publication remains separate because costs and revision-bound security need explicit design. Existing repository forbids worktrees and contains published dirty changes; release overlays only verified task files over current remote head.

Task 1: implemented; source preparation, distant keys, missing/conflicting answers, guessed-distractor rejection, option order/numeric evidence, omission visibility, cache/CAS and durable sequencing tested RED→GREEN. Original MCQ metadata persists; question-bank outline fallback removed. Uncertain questions are withheld, not automatically clinically validated.
Task 2: implemented; real-dialog browser regressions cover read-only bank, incomplete/unknown keys, source mode forwarding, preview/edit preservation and unsaved close/Escape/navigation. Existing reviewer edit API stays scoped to teaching fields.
Task 3: implemented; actual notification functions tested RED→GREEN for pending-study starvation, legacy response races, visibility/online resume, 8s cadence and non-overlap.
Supplement: deterministic canonical-image checks added to existing weekly audit (15 focused audit tests; full audit zero errors with a substantial nonblocking legacy warning backlog). Official publisher and exact PBS file licensing researched with connected Firecrawl; no book chapter subscription access claimed.
Final review: independent reviewer found distractor-as-answer acceptance and unsaved-close loss. Both fixed with failing regression tests first. Source-origin metadata retention was also covered by a failing publication regression.
Ruling: conservative string/evidence matching is structural only; real-file completeness and clinical equivalence need a teacher-approved benchmark. No paid-provider replacement or unattended medical publication is enabled by this checkpoint.
