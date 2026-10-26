# Agentic content and delivery workflow

This is the reusable low-token contract for large changes and source-file ingestion. Read
`AGENTS.md` first, then only this file, `content-protocol.md`, the target topic JSON, and the source
extraction manifest. Do not load the whole repository or old chat history.

## Roles and file ownership

One coordinator owns the final result. Suggested lanes, used only when the request needs them:

| Lane | Owns | Must return |
| --- | --- | --- |
| source | PDF text/figure extraction and page map | source digest, page ranges, figure inventory |
| lesson | lesson/tables/algorithms in target `data.json` | traceable dense teaching draft |
| assessment | flashcards, MCQ, KF/PMP | answer-key and distractor review |
| visual | figure selection, crop/quality/alt/caption | visual QA and provenance |
| clinical review | read-only claim/source check | blocking findings by stable ID |
| product/code | UI or pipeline files explicitly assigned | focused tests and diff summary |

Two lanes must not edit the same file concurrently. Workers do not run Git operations, change
secrets, deploy, or broaden scope. The coordinator integrates, validates, makes checkpoint commits,
pushes, and checks production.

## PDF to published topic

Sources may arrive as a local upload or as an authorized Telegram inbox item. Telegram records are
inputs only: copy/download the private object into a hashed extraction cache, retain its ingest ID
and provenance, and leave the record unaccepted until the same reviews below pass. A forwarded
channel name or topic hint is never evidence of medical correctness and never authorizes publish.

### Zero-cost intake and provider boundary

Receiving a Telegram message/file, storing it in the private Supabase inbox, assigning a Persian
topic hint, and sending signup/login/activity/message alerts use Telegram/Supabase only; they do not
call a language model. The paid-provider boundary begins only when `intmed-content-worker` submits
an inbox item to an external model. Do not disable operational alerts to save model tokens.

When no paid API credit is available, keep intake and quarantine working and process content through
one of these explicit lanes:

1. Attach the source directly to the coordinator chat when available. This is the simplest manual
   lane and needs no project API key.
2. Put private source files in an authorized Google Drive folder and send the exact file/folder link.
   Keep Harrison PDFs and patient/private material out of public repositories.
3. Use a dedicated GitHub intake folder only for authored or openly licensed, publication-safe text,
   manifests and images. A commit or pull request remains a review input, never automatic publish.
4. For unattended local processing, an owner-operated local model (for example Ollama) can prepare a
   draft, but the same source, clinical, copyright and teacher-review gates still apply.

Free hosted model tiers (Gemini, Cloudflare Workers AI, Groq, OpenRouter free routes, Hugging Face)
may change quota, region availability, retention and terms without notice. Never silently fall back
to one or transmit private/book content to it. Add a provider adapter only after the owner explicitly
approves that provider and its data-handling terms. Creating a new OpenAI key does not add credit or
remove an organization/project billing limit.

The owner approved manual mode on 2026-10-26. Automatic worker dispatch is gated behind the
server-side `INTMED_CONTENT_PROCESSING_ENABLED` flag and defaults off: Telegram still saves inputs,
`/start` and `/status` remain useful, `/retry` explains that processing is paused, and no queued input
is discarded. Re-enabling this flag or changing provider is a separate operational decision and
requires owner confirmation.

1. **Identify and cache once.** Hash the input and run
   `python3 scripts/content_pipeline.py extract-pdf TOPIC_ID SOURCE.pdf`. Reuse the cached text,
   images and page manifest in later turns; never paste the full PDF into every agent prompt.
2. **Map before writing.** Produce a compact page map: headings, page ranges, algorithms/tables,
   important figures, gaps, and source edition/date. Exclude index/advertising/repeated headers.
3. **Create/inspect the package.** Initialize if absent; otherwise read only the target JSON.
   Declare the source once, preserve stable IDs and attach `sourceRefs` at the smallest useful unit.
4. **Draft the lesson.** Synthesize board-relevant Persian prose rather than translating line by
   line. Convert suitable decision diagrams to searchable prose/tables; preserve clinical images,
   tracings, plots and curves.
5. **Build assessments from the lesson.** Every tested fact must appear in the lesson and source.
   - MCQ: one best answer, plausible homogeneous distractors, no accidental clues, explanation of
     why the key is right and each distractor is wrong; mark authored questions as `draft`.
   - KF/PMP: evolving vignette, one decision per step, realistic new information, explicit expected
     action and critical errors; do not turn it into disconnected trivia.
   - Flashcards: atomic recall, front → back direction, no answer leaked on the front.
6. **Treat figures as source data.** Prefer the original embedded object. If absent, render only the
   figure region at 300–450 DPI from the source page. Do not screenshot a whole page or upscale a
   thumbnail. Verify labels at phone and desktop size; add Persian alt/caption, page/source credit,
   copyright/use note, stable image ID and content hash. Keep an archival extraction outside the
   web bundle and publish an optimized derivative (WebP/JPEG for photos, PNG/SVG for line art).
7. **Independent reviews.** Assessment, visual and clinical reviewers report against stable IDs.
   Automated checks can find omissions; only the teacher can change `reviewStatus` to `reviewed`.
8. **Validate and preview.** Run the commands below, open the lesson/questions/images at narrow and
   wide viewports, fix findings, and rebuild. Generated `docs/content/` files are never hand-edited.
9. **Publish a checkpoint.** Commit/push one coherent topic or feature while context remains. Check
   the workflow and deployed asset before starting the next long tranche. Record any external
   blocker or follow-up in `PROJECT_STATE.md` in that same checkpoint.

```bash
python3 scripts/content_pipeline.py validate
python3 scripts/content_quality_audit.py --topic TOPIC_ID
python3 scripts/content_pipeline.py build
python3 scripts/content_pipeline.py check
```

## Image and Harrison algorithm library contract

Do not create a second hardcoded catalog. Extend canonical topic content with stable figure metadata
and generate a searchable index during build. Each entry needs: `id`, `topicId`, kind
(`algorithm|table|tracing|radiology|pathology|pbs|clinical|chart`), Persian title/alt, keywords, source
ID/pages/edition, copyright/use note, review state, original hash, derivative dimensions and path.

Use `kind: "pbs"` only for a peripheral blood smear (لام خون محیطی), not marrow aspirates,
histopathology or generic microscopy. A PBS item must retain the source edition and page/figure,
an explicit copyright/use note, a medically useful Persian caption/alt, and draft/reviewed status.
Do not infer PBS from a filename or publish a book screenshot: extract the original embedded image
when possible, otherwise crop only the figure at 300–450 DPI from a user-supplied authorized PDF.

Every new image also declares one rights/provenance lane with `sourceClass`: `harrison-private`
for a user-supplied Harrison extraction that must remain private, `authored` for a newly drawn
original IntMed visual, or `open-license` for a web image whose exact license and source URL are
recorded. Citation alone does not make a copyrighted figure reusable. Missing legacy values remain
explicitly «unknown» in the library filter and must never be guessed from a title or filename.

The future dashboard library reads that generated index and offers subject/topic/kind/source filters,
Persian search, favorites, recent items, full-resolution viewing and a “go to lesson” deep link.
Algorithms should also have a structured text/table representation so they remain searchable,
accessible and usable when an image cannot load. Paid images follow the same entitlement boundary as
paid lessons; do not expose their originals in a public static directory.

## Periodic quality engine

The safe design is detect → report → review → patch, never autonomous medical rewriting.

1. On every content change, run schema/build checks plus `content_quality_audit.py --strict` for the
   changed topic.
2. Weekly, audit all topics and save JSON as a workflow artifact. Group findings by stable topic/item
   ID and deduplicate them against the previous report.
3. Open/update one review issue for new spelling, missing provenance, weak question structure,
   broken image, low resolution, accessibility or stale-source findings.
4. A content agent proposes a source-cited patch; a separate clinical reviewer checks it; the
   teacher approves medical changes. Then validate/build/preview/publish normally.
5. Periodically sample rendered pages with narrow/wide visual regression and broken-link checks.

The repository workflow `.github/workflows/content-quality-audit.yml` runs this audit every
Saturday, keeps the complete JSON/Markdown report as a 90-day artifact, and creates or updates one
deduplicated GitHub issue. An unchanged fingerprint does not create issue noise. The workflow has
no write access to repository contents and therefore cannot rewrite or publish medical material.

The deterministic audit is intentionally conservative. A zero-warning report proves structural
hygiene, not medical correctness or currency.

## Prompt packet (copy, fill, send)

```text
Role: <lane>. Topic: <topic-id>. Source cache: <path + sha256>. Pages: <ranges>.
Read: AGENTS.md, docs/content-protocol.md, docs/AGENTIC_CONTENT.md, target data.json.
Own only: <files>. Deliver: patch + stable-ID findings + tests. No git/deploy/secrets.
Medical claims remain draft pending teacher review.
```

## Checkpoint policy for long prompts

Split by independently releasable value. After a lane is integrated and its focused tests pass, the
coordinator commits and publishes that checkpoint before starting another high-risk lane. Prefer
several small traceable releases over one uncommitted session. Never publish known-broken source just
to create a checkpoint; record a patch/worktree-independent diff and blocker instead.
