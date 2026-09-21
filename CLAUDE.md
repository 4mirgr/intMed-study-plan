# intMed-study-plan — standing content rules

This file is project memory for Claude Code sessions working on this repo. Read it before
building or editing content in `content/*/*/data.json`, `docs/index.html`, or the live
"مسیر بورد" artifact. It exists so recurring instructions from the user don't have to be
repeated every session, and so large cross-project tasks get tracked instead of dropped
when a single turn can't fit all of them.

## Standing content rules (apply automatically, no need to ask)

1. **کبد، نه جگر.** Never write "جگر" to mean the liver organ. Always use "کبد". This does
   not apply to proper nouns that happen to contain the sound (e.g. "پوتز-جگرز" for
   Peutz-Jeghers syndrome) — leave those alone.

2. **Flashcard front/back direction.** When building sequential/paired flashcards, keep
   front→back direction consistent and check it doesn't come out reversed.

3. **No English-word sentence breaks in Persian prose.** When a Persian sentence embeds an
   English word or abbreviation, the sentence structure around it must still read as
   correct Persian grammar — don't let the English term break the sentence.

4. **English-source lessons: keep it tight, not a translation dump.** This applies to
   `lesson[].body` text built from an English-language PDF source (Harrison's chapters,
   English lecture slides, etc.) — **not** to content built from Persian sources (e.g. Dr.
   Hashemi's Persian slide decks), unless the user says otherwise for a specific topic.
   - Cover every clinically tested fact (anything that appears in a flashcard, MCQ, or
     KF/PMP step for that topic must still be traceable somewhere in the lesson prose —
     that requirement from the earlier "coverage" rule stays in force).
   - But get there in noticeably less text than a full-paragraph translation of the source
     would take. Cut restatement, cut redundant transitional sentences, cut illustrative
     asides that don't carry a fact the user needs for boards. Prefer dense factual
     sentences and short paragraphs over long expository ones.
   - Concretely: where an earlier pass produced ~800-1200 words per lesson section translated
     near-verbatim from the English chapter, the target is roughly half that, without
     dropping any fact that's tested elsewhere in the topic.
   - When in doubt about a specific passage's necessity, keep the fact, cut the
     surrounding scaffolding sentence.

5. **Don't force-translate uncommon terms.** When a technical term, drug name, eponym, or
   phrase from an English source doesn't have a natural, commonly-used Persian equivalent,
   leave it in English inline rather than coining an awkward Persian rendering. Judgment
   call: if a clinician reading Persian medical text would normally see the term written in
   Latin script anyway (most drug names, many eponymous signs, abbreviations like ARDS,
   AGMA, ORL1), keep it in English. Common, well-established Persian medical vocabulary
   (فشار خون, نارسایی کلیه, etc.) stays Persian as normal.

6. **Copyrighted figures never get embedded.** Publisher figures/diagrams/photos are
   described in lesson prose or rebuilt as markdown tables (for algorithms/flowcharts), never
   extracted as images, because this content syncs to a public static site. Plain factual
   data tables (not artwork) ARE reproduced verbatim as markdown tables.

## Workflow for building/updating a topic from a PDF

1. Read the PDF (`pages` param in chunks if long).
2. Draft `content/<category>/<topicId>/data.json` matching
   `content/_schema/topic-content.schema.json` via a scratchpad Python build script
   (pattern: `flashcards`, `mcq`, `kfPmp`, `images: []`, `tables`, `lesson`).
3. Validate: run the script, then grep the output for `جگر` (must be 0 unless a proper
   noun), sanity-check field counts, and actively check rules 2 and 3 above (flashcard
   front→back direction; no English-word breaking a Persian sentence's grammar) on every
   card/section produced — not just جگر — so new content doesn't join the QA backlog below.
4. Regenerate the bundle: `python3 scripts/build_content_bundle.py` (writes
   `docs/content-bundle.json`).
5. Sync the topic(s) to the live artifact db via `ArtifactData` batch `set` on
   `topic_content/<topicId>`, shaped as `{"id": topicId, "data": {flashcards, mcq, kfPmp,
   images, tables, lesson}}` (no `topicId`/`category`/`sourceNote` keys in the db doc — those
   are local-file-only provenance fields).
6. If taxonomy changed (new topic/category, renamed/removed items), update the `TOPICS`
   array in **both** `docs/index.html` and the live artifact's saved HTML (read it fresh via
   `Artifact action:"read"` first — the local cached path changes every read), then
   republish the artifact.
7. `git add`/`commit`/`push` to the current working branch.

Live artifact URL: `https://claude.ai/artifact/KBQtkHAoVaaHvgEbcEEXBc` ("مسیر بورد").

## Pending cross-project follow-ups (bulk tasks not yet done)

Tracked here so a future session can pick them up without the user re-explaining, and so a
single turn's context limit doesn't quietly drop them.

- **Condense lesson prose in already-built English-sourced topics** (rule 4 above, applied
  retroactively). Built before this rule existed, so their `lesson[].body` text runs long.
  Revisit each and tighten without losing tested facts:
  - `crit/crit-vent`
  - `id/id-sepsis`
  - `gi/gi-lft`
  - `nephro/nephro-azotemia`
  - `poison/poison-general`
  - `poison/poison-heavy-metal`
  - `poison/poison-snakebite`
  - `poison/poison-arthropod`
  - (`crit/crit-shock` was condensed — see done list below.)
  Persian-sourced topics (`poison/poison-opioid`, anything from Dr. Hashemi's slides) are
  explicitly exempt from this pass unless the user asks.

- **Broader "reversed flashcards" / "English-breaks-Persian-sentence" QA pass** the user
  asked for early on, across all topics **built before 2026-09-21** (when rules 2/3 became an
  active per-build check per the workflow step above, not just a passive standing rule).
  Only concretely fixed instances found so far; the user confirmed this is deferred — don't
  start it until asked. Content built from 2026-09-21 onward should already comply (checked
  at build time), so it does not need to be re-swept when this pass eventually happens —
  scope the pass to topics that existed before that date.

## Recently completed (for context, trim as it goes stale)

- Built `poison` category (5 topics: general, opioid, heavy-metal, snakebite, arthropod)
  from Harrison Ch 469-472 + Dr. Hashemi's opioid slides.
- Condensed `crit/crit-shock` lesson prose per rule 4.
