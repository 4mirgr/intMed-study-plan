# Question-first intake and review

Approved direction: owner requested question-bank input to retain original MCQs, pair answer keys across the file, derive lessons/cards from supported answers, repair presentation without changing medical meaning, and withhold ambiguous/conflicting items (2026-11-05, Tehran).

## Approach

Use the existing private Gemini/native-extraction/durable-job pipeline, not a new provider. Before generation, detect question-like sources and cache structured original questions with source/answer pages. Resolve keys only from explicit source evidence; incomplete/ambiguous records remain visible but cannot feed teaching outputs. Prose-only inputs retain the existing lesson workflow. Formatting repair does not change clinical values or invent explanations. Source MCQs retain an origin/reference, distinct from authored questions.

Alternatives: prompt-only cleanup is insufficient for cross-page keys; provider replacement lacks a benchmark and changes cost/privacy. The owner approved the structured question-first approach instead.

## Deliverables

- Resumable source-question preparation before generation, bounded chunks, cached results, revision-checked writes. No approval/publication by the model.
- Read-only source question preview with withheld items, readable editable generated artifacts and explicit unsaved-change protection.
- Visible/online notification refresh every 8 seconds without starving behind study saves or overwriting pending legacy messages.

## Constraints / later work

Private sources stay in Supabase. Source/clinical/copyright gates remain enforced. Model confidence is never authorization. Harrison 22e (2025) requires authorized text access; public publisher metadata is not full-book access. Citation does not license images. Existing weekly deterministic audit remains the no-model-cost monitoring foundation.

Continuous model/web research with a spend budget, Telegram revision-bound approval/publication, and the cross-repository hosting-pin bridge are separate integration work. Do not claim them active or quietly activate an unbounded paid loop. Telegram approval must eventually bind authorized sender/private chat, exact draft revision/hash, expiring single-use intent, and the existing review gates.

## Verification

Synthetic multi-page question/key fixtures; Persian/Arabic digits; missing/conflicting keys; stale edits; retries reuse cached work; no source question loss at chunk boundaries; invalid citations and incomplete JSON rejected. UI/browser and notification tests exercise actual code. Publish no real draft for testing.
