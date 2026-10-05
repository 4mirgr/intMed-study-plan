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

6. **Copyrighted figures: embed the ones worth embedding, with explicit source citation —
   standing protocol since 2026-10-05.** This rule originally banned embedding publisher
   figures outright. The user reversed it 2026-10-04 (pointing to the pre-existing
   `cardio-hf` precedent) and then, 2026-10-05, made it explicit standing protocol for
   **every future topic build**, not a case-by-case ask: "از این به بعد برای تصاویر فصول به
   همین شکل عمل کن و این رو جزو پروتکل ساخت مباحث بخاطر بسپار." Do this automatically
   whenever a PDF build comes with attached figures — don't wait to be asked per topic.
   **The method, every time:**
   - Look at every attached figure. Sort into two buckets: (a) a diagram/algorithm/decision
     table whose actual informational content is equally or better captured as a markdown
     table or lesson-prose description — these do **not** need embedding, build them as
     tables/prose as usual; (b) a clinical photograph, population plot/histogram, natural-
     history curve, or raw signal tracing (PSG, waveform, etc.) that a table genuinely
     cannot substitute for — **these get embedded**, every time, not left out by default.
   - Process: photographic content (clinical photos) → JPEG, quality ~85, re-lower to 75/65
     if still too large. Flat-color/line-art content (plots, curves, diagrams) → PNG palette
     quantize (`im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)`), same
     method as the infographic section below. Check the compressed output visually before
     using it.
   - Embed as `data:<mime>;base64,...` directly in that topic's `images[].sourceUrl` (see
     the infographic section below for the full mechanics) — **never** pass raw base64
     through a tool-call parameter by hand.
   - `note` field **always** cites the source verbatim, e.g. "تصویر هاریسون؛ منبع:
     Harrison's Principles of Internal Medicine, 22nd Edition — Copyright © McGraw Hill."
     plus a plain-language description of what the figure shows, and a pointer to the
     table/lesson section covering the same ground in text where one exists. Never embed
     without this citation.
   - Verify integrity every time: SHA-256 of the source file vs. SHA-256 of the re-decoded
     data URI read back from the saved JSON, both before syncing to the artifact db.
   - Check the resulting doc size against the 256 KiB per-db-doc cap (see the infographic
     section below) **before** committing to embedding every bucket-(b) figure for a
     chapter — if a topic's text content is already heavy, that budget, not a reluctance to
     embed, is what should cap the count. State the resulting doc size (and % of budget)
     in the session's CLAUDE.md entry every time, same as the infographic/AKI/CKD passes.
   - This is the user's own call on their own content/copyright exposure — not something to
     second-guess per topic. The only judgment left to exercise is bucket (a) vs (b) and
     the size budget, not whether to embed at all.
   - **Rendering requirement, already fixed but worth knowing if it ever regresses**: the
     images tab in both `docs/index.html` and the artifact renders any `data:`-URI image
     **inline** (`<img>`), never as a `target="_blank"` link — linking to a `data:` URI gets
     silently blocked by mobile browsers' anti-phishing top-navigation rules, which is what
     caused the 2026-10-05 "blank white page" bug. See that session's CLAUDE.md entry below
     for the full story; don't reintroduce the link-based pattern for new images.

## Workflow for building/updating a topic from a PDF

1. Read the PDF (`pages` param in chunks if long).
2. Draft `content/<category>/<topicId>/data.json` matching
   `content/_schema/topic-content.schema.json` via a scratchpad Python build script
   (pattern: `flashcards`, `mcq`, `kfPmp`, `images: []`, `tables`, `lesson`).
2a. **If any figures were attached with the PDF**, sort and embed per rule 6 above —
    automatically, not just when asked. Diagrams/algorithms → markdown tables (as part of
    step 2). Photos/plots/tracings → embedded in `images[]` with source citation, per the
    process in rule 6. Do this in the same build pass, not a separate follow-up.
3. Validate: run the script, then grep the output for `جگر` (must be 0 unless a proper
   noun), sanity-check field counts, and actively check rules 2 and 3 above (flashcard
   front→back direction; no English-word breaking a Persian sentence's grammar) on every
   card/section produced — not just جگر — so new content doesn't join the QA backlog below.
   If images were embedded, also verify SHA-256 integrity and check the doc size against
   the 256 KiB cap (rule 6).
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
8. **Notification (standing instruction, added 2026-09-23, method fixed 2026-09-23, email leg
   cancelled 2026-10-01):** after any update that commits/pushes (content changes, taxonomy
   changes, or bug fixes to `docs/index.html`), do the following once per logical batch of
   changes (not once per individual file edit — e.g. once at the end of a multi-topic
   session):
   - **`SendUserFile`** with the current `docs/index.html` path, so a copy lands on whatever
     device/browser the user is chatting from right now.
   - **No email.** The user explicitly cancelled the Gmail-notification leg of this step
     (2026-10-01): "فعلا اون سیستم ارسال ایمیل بعد از پایان هر سشن رو دیگه ادامه نده و کنسل
     کن." Do not call `mcp__Gmail__send_message`/`create_draft` for this notification anymore
     — `SendUserFile` alone satisfies this step until the user asks to restore email. (The
     history below — base64 attachment pitfall, the four recipient addresses, the Gmail-auth
     failures that kept recurring — is kept for context in case the user ever re-enables it,
     not as something to act on now.)
     - Prior method once this leg was active: email via `mcp__Gmail__send_message` from the
       user's own connected Gmail account, to all four addresses — amirgr20@gmail.com,
       dr.gerami.md@gmail.com, amir.h.gerami@sbmu.ac.ir, drgerami@iran.ir — with a short
       subject/body noting what changed, linking to `https://drgerami-md.ir` (the live
       GitHub Pages deployment of this same `docs/` folder, per `docs/CNAME`) rather than
       attaching the file.
     - Do NOT attach `docs/index.html` to the email as base64 if this is ever re-enabled.
       Tried this once: the file (~60KB → ~80,000 base64 chars) has to be reproduced as
       literal text in the tool call, and manual reconstruction from a chunked file read
       silently diverged from the original at char 401, confirmed via `cmp` — undetectable
       without an explicit byte-level check. The Gmail tool has no file-path/attachment-by-
       reference option, so there was no reliable way to attach a file this size through it.

Live artifact URL: `https://claude.ai/artifact/KBQtkHAoVaaHvgEbcEEXBc` ("مسیر بورد").

## Login gate on `docs/index.html` (added 2026-09-26)

`docs/index.html` has a client-side login gate (`#loginGate` overlay + `#appRoot` wrapping the
`.app` div, plus a small IIFE at the top of the `<script>` block, before the main app IIFE).
Credentials are checked via `fnv1aHex(username + ":" + password)` against a hardcoded hex
constant (`GATE_HASH`) — a plain synchronous JS hash (FNV-1a), deliberately **not**
`crypto.subtle`/SHA-256 (tried that first; it broke for the user because Web Crypto's
`subtle` requires a secure context and their browser/webview didn't have one — no `https://`
enforcement or an in-app browser can both cause this). Not real security either way (static
site, no backend; anyone with devtools can bypass it) — deterrence against casual/accidental
visitors only, by explicit user decision. `content-bundle.json` itself is NOT protected — it's
fetched by unauthenticated requests too if someone hits that URL directly; the user explicitly
accepted this scope.

Login input also runs through `normalizeDigits()` before hashing (strips stray Unicode
direction-mark characters, converts Persian ۰-۹ and Arabic-Indic ٠-٩ digits to ASCII, trims) —
the password is a phone number, and Persian mobile keyboards commonly type Persian/Arabic-Indic
digits instead of ASCII, which would otherwise hash to something else and silently fail.

The file also now has `<meta charset="utf-8">` as its first line (it has no `<head>`/`<body>`,
just a fragment) — added because without it, encoding depended entirely on the server's
Content-Type header, and literal Persian-digit characters inside the inline JS could get
misinterpreted before the script even ran. Keep this tag if the file is ever restructured.

- Passing auth sets `localStorage['bp_authed'] = '1'` so the user isn't re-prompted every visit
  (per-browser/per-device — a new device/browser needs to log in once).
- **When editing `docs/index.html` for taxonomy or other changes**: preserve this gate markup
  and script block exactly — don't remove `#loginGate`/`#appRoot`/the auth IIFE while doing
  unrelated edits (e.g. `TOPICS` array changes). Never edit the credentials without an explicit
  new instruction from the user.

## GitHub-backed sync: progress, notes, and highlights (added 2026-10-01)

### Why this exists
`docs/index.html` (served at drgerami-md.ir) is a plain static GitHub Pages file with
**no backend**. Before 2026-10-01, it tried `window.claude.use('db')` for all persistence
(phase checklist, topic status/notes) — that API only exists inside the claude.ai artifact
iframe, so on the actual static site `db` was always `null` and the UI silently showed
"نسخه ایستا — تغییرات ذخیره نمی‌شن" (no persistence at all, not even the phase checklist).
This was a pre-existing bug, discovered while scoping the highlight/note-taking feature the
user asked for, and fixed as part of the same change.

### Storage: a dedicated branch, not the content repo's normal history
Persistent state lives in a single JSON file, `state.json`, on a **separate orphan branch**
`study-state` in this same repo (`4mirgr/intMed-study-plan`) — never the branch GitHub Pages
builds from. Shape:
```json
{
  "version": 1,
  "updatedAt": "ISO timestamp",
  "itemState": { "<phase-item-id or topic-id>": {checked/status, note} },
  "meta": { "currentPhaseOverride": null },
  "highlights": { "<topicId>": [ {id, loc, quote, occurrence, color, note, createdAt} ] }
}
```
Kept on its own branch so frequent small writes (every checkbox tick, every highlight)
don't trigger GitHub Pages rebuilds and don't clutter the content-commit history that
`git log` on the main working branch shows.

### Client: GitHub Contents API, no server
Both `docs/index.html` and the live artifact's HTML read/write `state.json` directly from
the browser via the GitHub REST Contents API (`GET`/`PUT .../contents/state.json?ref=study-state`),
authenticated with a **per-device Personal Access Token** the user pastes into a small modal
("اتصال به GitHub" button in the header) and that's stored in that browser's `localStorage`
(key `gh_pat`) — never sent anywhere but api.github.com. CORS on api.github.com is open
(`Access-Control-Allow-Origin: *`), confirmed via curl before building this. Each device/
browser needs its own one-time connect; the modal's own copy walks the user through creating
a **fine-grained PAT scoped to only this repo**, Contents: Read & write — explicitly not a
classic/all-repos token, since the token sits in localStorage behind only the existing
(non-real-security) login gate.

Writes are whole-document, debounced, GET-sha-then-PUT (standard Contents API update
pattern) — **last-write-wins at the document level, not a field-level merge.** Fine for one
person's own few devices used at different times; two tabs saving at literally the same
moment can clobber each other. Discrete actions (checkbox, status pill, highlight add/
delete) flush almost immediately (~400ms debounce); free-text note typing debounces longer
(~900ms net, via the pre-existing `scheduleNoteWrite` wrapper). A 20s fallback interval
flushes anything still dirty (covers continuous typing), and a `visibilitychange`→hidden
listener does a best-effort flush on tab-switch/app-background. There is **no reliable
flush on tab close** (`sendBeacon` can't do authenticated PUT) — a quick close right after
typing can lose the last ~1s of an edit; this is a known, accepted limitation.

### The live artifact is a special case: two backends, intentionally
The claude.ai artifact's phase-checklist/topic-status/notes (`item_state`, `meta`) already
persisted fine there via the artifact's own native `db` capability (`window.claude.use('db')`
genuinely works inside claude.ai) — that code path was **left untouched**. Only the new
highlight/note feature on the artifact was wired to the GitHub `state.json`, via a second,
independent PAT-connect button, so highlights end up in the **same place** regardless of
whether the user studies via drgerami-md.ir or the claude.ai artifact — required for "ask
Claude to extract my highlights later" to work from one canonical source. If you ever revisit
this: it means the artifact's `item_state` and `highlights` genuinely live in two different
stores (db vs. GitHub) by design, not by accident — don't try to "fix" that into one store
without the user asking.

### Highlight/note feature itself
Scope (per 2026-10-01 user decision): lesson prose paragraphs, flashcard backs, and table
cells — not MCQ/KF-PMP/images. Anchoring is by `(topicId, loc, quote, occurrence)`: `loc` is
`lesson:<sectionIdx>:<paraIdx>`, `fc:<flashcard.id or index>`, or `table:<tableIdx>:<row>:<col>`;
`occurrence` disambiguates repeated identical substrings within the same block. If the
underlying content text is later edited, an orphaned highlight just silently stops
re-attaching as a `<mark>` on render — it's still in storage (visible via "هایلایت‌های من"
per topic), it just won't show inline anymore. No image/offset-based anchoring, no OCR —
pure substring matching, deliberately simple.

Selecting text inside an annotatable container shows a small floating toolbar (4 color
swatches + a note button); a existing `<mark>` is clickable to view/edit/delete via a small
popover. Both use `prompt()`/`confirm()` for note entry — plain, works identically on mobile/
desktop, chosen over a custom modal to keep this scope-contained.

### If asked to "extract my highlights"
Read `state.json` directly off the `study-state` branch (`GET /repos/4mirgr/intMed-study-plan/
contents/state.json?ref=study-state` — a plain git fetch of that branch, or the GitHub API,
both work since this session already has repo access). As of the multi-user change below,
the shape is `{version:2, users:{<userId>:{itemState, meta, highlights}}}` — parse
`users[userId].highlights[topicId]`, not a top-level `highlights` key (that was the pre-
multi-user v1 shape; `migrateStateShape()` in both HTML files converts an old v1 document to
v2 on first load, but a file read directly off the branch could still be v1 if no client has
written to it since). If the user doesn't say which user, ask, or default to `amir` (the
primary user) and say you assumed that.

## Multi-user support (added 2026-10-01)

### Why
The user asked for a second person to be able to log in with their own username/password and
have their phase-checklist/topic-status/notes/highlights kept separate from the primary
user's — not just highlights, per the user's explicit choice ("همه‌چیز جدا بشه") when asked
whether to scope the separation to highlights only or to all persisted state.

### Login: `GATE_USERS` array, not a single hash
`docs/index.html`'s login-gate IIFE (near the top of the single `<script>` block) now holds:
```js
var GATE_USERS = [
  { hash: "49e9c6e4", id: "amir" },      // درگرامی / دکتر گرامی
  { hash: "bd59ba56", id: "arash" },     // آرش
  { hash: "2e75e6cc", id: "alisalehi" }  // علی صالحی
];
```
Each entry is `fnv1aHex(lowercased-username + ":" + normalized-password)` (same `fnv1aHex`/
`normalizeDigits` used before multi-user support — see the login-gate section above) paired
with a stable `userId` used to namespace that person's data. **To add another person**:
compute their hash the same way and append one more `{hash, id}` entry — nothing else needs
to change structurally. Current credentials: primary user **drgerami / 09125448285**
(`id: "amir"`), second user **arash / 09127389946** (`id: "arash"`), third user **alisalehi /
09130523880** (`id: "alisalehi"`) — state them plainly if the user asks, don't treat them as
secret from the user themselves. `USER_NAMES = {amir: "دکتر گرامی", arash: "آرش", alisalehi:
"علی صالحی"}` drives the header label and reset-confirm text.

(History: the second user's id/credentials were originally shipped as a placeholder,
`hamkar`/482917 — since the user hadn't yet said who the second person actually was. Updated
2026-10-01, same day, once the user specified the real person: username `arash`, password
`09127389946`, id renamed `hamkar`→`arash`. No real data existed under the old `hamkar` bucket
key yet when this happened, so the rename was a clean swap, not a migration. If a future
rename ever needs to preserve an already-populated bucket, do the migration explicitly —
don't assume `migrateStateShape` handles a bucket-key rename, it only handles the v1→v2
shape change.)

On successful login the submit handler sets `localStorage.bp_authed` and
`localStorage.bp_user_id`, then calls `location.reload()` — **not** just `revealApp()`. This
is load-bearing: the main app IIFE's `CURRENT_USER_ID` is computed once, synchronously, from
`localStorage.getItem("bp_user_id")` at script-load time (it runs immediately even while the
login gate is covering the screen, since that's just a CSS overlay). For an already-
authenticated session this is fine (bp_user_id is already set before the script runs). But
for a brand-new login in a tab that was never authenticated, the main IIFE already ran and
fixed `CURRENT_USER_ID` to its fallback (`"amir"`) before the form was even submitted — so
without a reload, a fresh second-user login would silently keep writing into amir's bucket
for the rest of that tab's lifetime. Caught this via Playwright testing before shipping; if this
reload is ever "simplified" away, that bug comes back. A logout (`#logoutBtn`) clears both
localStorage keys and also reloads (via `location.reload()` inside the click handler).

### Storage shape: `STATE.users.<userId>`, not flat
`state.json` on the `study-state` branch moved from the old flat v1 shape
(`{version:1, itemState, meta, highlights}`) to:
```json
{
  "version": 2,
  "updatedAt": "ISO timestamp",
  "users": {
    "amir":  { "itemState": {...}, "meta": {...}, "highlights": {...} },
    "arash": { "itemState": {...}, "meta": {...}, "highlights": {...} }
  }
}
```
Both `docs/index.html` and the live artifact implement the same pattern:
- `myBucket()` (artifact: hardcoded id `ARTIFACT_USER_ID = "amir"`; docs/index.html: reads
  `CURRENT_USER_ID` from localStorage) lazily creates and returns `STATE.users[<id>]`, and
  every write path (`writeItemState`, `writeTopicState`, `writeMeta`, `ensureHighlightsArr`,
  `commitHighlight`) goes through it instead of touching `STATE` directly.
- `migrateStateShape(remote)` runs on every `connectGithub()` load: if `remote.users` already
  exists it's returned as-is (already v2); otherwise the old flat `remote` is wrapped as
  `{version:2, users:{amir:{itemState, meta, highlights}}}` — **always attributed to `amir`**,
  since any pre-multi-user data belongs to the original single user. This is a one-way,
  non-destructive read-time conversion — nothing is migrated in place on GitHub until the
  next save, which naturally writes back in v2 shape.
- `cleanedStateForSave()` iterates every key in `STATE.users` (not just the current user's)
  and writes all of them back — this is what keeps one user's save from clobbering another's
  bucket, since the whole document is still a single GET-sha-then-PUT write (see the
  dual-backend/last-write-wins notes above, which still apply at the document level).
- The reset button (`#resetBtn`) only clears `myBucket()`'s `itemState`/`meta`/`highlights` —
  confirm text names the current user by their display name and explicitly states the other
  user's data is untouched.

### The artifact has no login gate — hardcoded to `amir`
The claude.ai artifact ("مسیر بورد") has no username/password UI of its own (it's already
private via claude.ai's own access control). Its highlight-sync module (the GitHub-backed
half — its native `db`-backed phase-checklist/topic-status code, untouched, still has no
concept of multiple users at all) hardcodes `ARTIFACT_USER_ID = "amir"`. It still round-trips
correctly: `migrateStateShape`/`cleanedStateForSave` are generic over however many keys exist
under `STATE.users`, so an `arash` bucket written from drgerami-md.ir passes through the
artifact's reads/writes unchanged — the artifact just never reads or writes to it. Don't add
a second PAT-connect/identity option to the artifact without the user asking; if a real
second identity is ever needed there, it needs its own UI decision, not just copying
`CURRENT_USER_ID`'s localStorage read (the artifact iframe's localStorage isn't shared with
drgerami-md.ir's origin anyway).

### Testing note
End-to-end multi-user testing (login as each user, confirm bucket isolation, confirm v1→v2
migration preserves the original user's data as `amir`) was done via Playwright against a
local HTTP server (pattern: `python3 -m http.server`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` since `playwright install` is blocked in
this environment) plus an instrumented scratch copy of each HTML file that exposes internal
functions (`migrateStateShape`, `myBucket`, `cleanedStateForSave`, `CURRENT_USER_ID`/
`ARTIFACT_USER_ID`) onto `window.__test` for direct inspection — never add such a hook to the
real committed files. A real GitHub PAT-authenticated round trip (the actual Contents API
GET/PUT) still can't be exercised from inside a Claude Code session (same credential-
exploration boundary as the original single-user sync work) — only the user can confirm that
leg, on a real device with a real token.

## Shared topics (same content, listed under two categories)

Sometimes a topic genuinely belongs under two categories at once (e.g. "رابدومیولیز و
میوپاتی" under both `poison` and `nephro`) and edits to it must apply to both listings
automatically — never two hand-maintained copies that can drift apart. The renderer's
per-topic DOM/state (`topicEls[id]` in the artifact's `index.html`/board-plan JS) assumes
one unique topicId per nav entry, so **do not** list the literal same topicId twice in
`TOPICS` — that causes real state-sync bugs (status pill, notes, learn-panel state only
track whichever instance was rendered last).

Correct pattern instead:
1. Exactly **one** canonical content file, e.g. `content/nephro/rhabdo-myopathy/data.json`
   (`topicId: "rhabdo-myopathy"`). This is the only file ever hand-edited for this topic.
2. Give the second nav listing a distinct **alias topicId** (e.g.
   `"poison-rhabdo-myopathy"`) in `TOPICS` under the other category, in both
   `docs/index.html` and the live artifact HTML.
3. `scripts/build_content_bundle.py` has a `SHARED_TOPIC_ALIASES` dict (alias → canonical)
   near the top; it duplicates the canonical topic's bundle entry under the alias key after
   the normal file scan. Add new shared topics there — that's the only place the alias
   mapping needs to be declared for the bundle.
4. When syncing to the live artifact db, `set` **both** `topic_content/<canonical>` and
   `topic_content/<alias>` docs with the identical data (batch write, one `file_path`/`data`
   reused for both doc_ids).
5. Editing later: only ever touch the canonical file, then redo steps 3-4 (rebuild bundle,
   re-sync both db docs) — never hand-edit the alias's content anywhere.

Existing shared topic: `rhabdo-myopathy` (canonical, `content/nephro/rhabdo-myopathy/`) /
`poison-rhabdo-myopathy` (alias, same content, listed under `poison`).

## Generating a custom infographic for the `images` section (added 2026-10-03)

When asked to build an original summary graphic/infographic for a topic (not extract a
copyrighted publisher figure — rule 6 still bans that), the working pattern is:

1. Design it as a self-contained HTML file (RTL, Persian font via Google Fonts `@import`,
   fixed pixel width e.g. 1500px so layout is deterministic) in the scratchpad, pulling the
   actual facts from that topic's own `flashcards`/`lesson`/`tables` — don't invent content
   not already established in the topic.
2. Render it to PNG via Playwright (`p.chromium.launch(executable_path='/opt/pw-browsers/
   chromium-1194/chrome-linux/chrome')`, screenshot `full_page=True` after resizing the
   viewport to the page's measured `scrollHeight`). Actually look at the screenshot (Read
   tool) before moving on — check for clipped/overlapping elements at the edges (e.g. a
   flex-row connector arrow on the last item in an RTL row can clip against
   `overflow:hidden` — remove or hide it on the last item).
3. Shrink the file before doing anything else with it: `im.quantize(colors=256,
   method=Image.MEDIANCUT, dither=Image.NONE)` (Pillow, available in this environment) on a
   flat-color/text-heavy infographic cuts file size roughly 4x with no visible quality loss
   — cheaper than downscaling resolution. Re-view the quantized output to confirm.
4. **Where the image ends up — this took real trial and error, don't redo the exploration:**
   - **Google Drive upload is impractical for an image this size.** The `mcp__Google_Drive__
     create_file` tool only accepts inline `base64Content` (no file-path/reference option),
     and a single Read of a ~180,000-character base64 file measured at roughly **1 token per
     base64 character** in this tokenizer — i.e. ~170,000 tokens just to read it back, before
     even reproducing it in a tool call. This is the same failure category the
     Gmail-attachment pitfall above warned about (silent corruption from manual
     reconstruction), except here the token cost alone rules it out even before corruption
     risk enters into it. Do not attempt Drive upload for a generated infographic this way.
   - **The `Artifact` tool's own asset upload (`asset: true`, `file_path: <local path>`,
     against an artifact with `capabilities: {assets: {}}` declared) avoids the inline-base64
     problem entirely** — it reads the local file server-side, no retyping. It works and is
     fast. **But its resulting blob URL (`/_blob/<id>`) returned HTTP 403 when fetched with a
     plain unauthenticated `curl`** (verified directly) — it only resolves for someone who can
     already open that artifact in claude.ai. Since `docs/index.html`'s images panel just does
     `a.href = img.sourceUrl; target="_blank"` for an arbitrary browser tab on
     drgerami-md.ir with no claude.ai session, this route doesn't serve the actual use case
     unless the user explicitly shares that artifact publicly first (their call, via the
     artifact's own Share menu — not something this session can do).
   - **What actually works today: embed the image as a `data:image/png;base64,...` URI
     directly in that topic's `images[].sourceUrl`.** Build it with a Python script (Bash
     tool) that reads the PNG and writes the URI straight into `content/<cat>/<topic>/
     data.json` — never pass the base64 through a tool-call parameter by hand. **Verify
     integrity after writing**: re-read the saved JSON, decode the embedded data URI, and
     compare its SHA-256 against the original PNG's SHA-256 (compute both once, before and
     after) — this is the explicit byte-level check the Gmail incident's postmortem said was
     missing; do it every time, it's cheap insurance.
   - Sync to the artifact db the same way: write a local `{id, data}` JSON file with the
     embedded URI and pass it to `ArtifactData` via `file_path` (never `data` inline, for the
     same token-cost reason as Drive). The server itself warns on a write like this
     ("Documents hold data, not files... a document is at most 256 KiB") — the write still
     succeeds under that cap, but **check the resulting document size against the 256 KiB/doc
     limit** (a ~135 KB PNG's data URI alone is ~180 KB after base64 inflation, so a topic
     with much existing flashcard/lesson text can get close to the ceiling fast — `endo-wilson`
     sits around 221/256 KiB after its one infographic; a second image on the same topic will
     likely not fit without a different hosting approach).
5. Tradeoff to tell the user plainly, every time: embedding in `content-bundle.json` adds the
   image's full base64 weight to **every visitor's** page load (the bundle is fetched whole,
   unconditionally, on every visit — see the GitHub-backed-sync section above), not just
   people who open that topic's images tab. For one infographic this is a few hundred KB,
   tolerable; it does not scale cleanly to many images across many topics. If the user wants
   more of these later, the better long-term fix is a genuinely public image host (e.g. they
   set a Drive folder to "anyone with the link," or they share the assets-capable artifact
   publicly) rather than repeating the data-URI pattern topic after topic — raise this instead
   of silently repeating the workaround if asked for a second or third infographic.

## UI design system for `docs/index.html` (added 2026-10-03)

`docs/index.html` was redesigned visually — "Premium Medical SaaS Glassmorphism" (navy/cyan
palette, glass surfaces, soft Bento cards, floating pill nav, segmented controls) — as a
**CSS-only** change: every id, every JS-generated `className`, every `data-*` attribute, and
the entire HTML body and `<script>` block are untouched from before the redesign (verified by
diffing everything after `</style>` byte-for-byte against the prior commit — it was identical).
If you ever need to redo a pass like this (new palette, more components), the same discipline
applies: **only rewrite the `<style>` block**, keep every selector name that's referenced from
`<script>`, and diff the post-`</style>` content against the previous version before committing
to prove nothing else moved.

**Design tokens** live in `:root` (light) and the existing `:root[data-theme="dark"]` /
`@media(prefers-color-scheme:dark)` dark variant (same pattern pre-dating this redesign, just
with new values): `--bg`/`--bg-grad-1/2/3` (ambient blob gradients painted on `body` via
`background-image`, not extra DOM elements), `--surface`/`--surface-strong`/`--surface-solid`
(glass vs. solid-fallback surfaces), `--primary`/`--primary-light`/`--accent`/`--accent-ink`,
`--border`/`--border-strong`, `--shadow-sm/md/lg`, `--blur` (18px), `--radius-sm/md/lg/xl/pill`,
`--ease`/`--dur` (shared transition timing, `cubic-bezier(.2,.8,.2,1)` / 200ms). Per-category
and per-phase accent colors (`--phase-color`/`--cat-color`, set inline by JS from the
`PHASES`/`TOPICS` config arrays — do not touch those JS-set custom properties) layer on top of
these tokens via the existing `var(--phase-color,var(--accent))` fallback pattern.

**Glass surfaces** use `background:var(--surface|--surface-strong)` (translucent) +
`backdrop-filter:blur(var(--blur))` + `-webkit-backdrop-filter` + a light translucent border,
with a plain `@supports not (backdrop-filter...)` fallback to `--surface-solid` for browsers
without support. Applied to: `header.top` (floating pill nav), `.callout`, `.here-card`,
`.phase`, `.topic-cat`, `.learn-panel`, modals (`.login-card`, `.gh-modal-card`), and the
highlight toolbar/popover (`.hl-toolbar`, `.hl-popover`).

**Scope of the redesign — what it does NOT include**, since the dashboard only restyles what
already exists and has real backing data: there's no separate "Weak Topics" / "Recent
Activity" / "Quick Access" bento cards, no circular progress ring (kept the horizontal bar —
switching to a ring would need JS changes to drive stroke-dashoffset, which this pass
deliberately avoided), and the floating nav only has the two real tabs (Dashboard/Education)
plus the existing GitHub-connect/Logout buttons — no "Progress" or "My Highlights" top-level
nav items, since those aren't separate views in the app (progress is inline on the dashboard;
highlights are per-topic, not a global aggregate). If the user wants any of this as actual new
functionality later, that's a logic change, not a restyle — flag it as such rather than
quietly inventing fake data to fill a bento slot.

**Known pre-existing quirk, not caused by this redesign**: clicking a `.item input[type=checkbox]`
inside an opened `.phase` via Playwright's standard `locator.click()` times out on
"element is not stable" / a sibling element "intercepts pointer events" — reproduced
identically on the pre-redesign file (tested both, same failure). Likely related to the
`.phase-body{max-height:0 → 20000px}` transition combined with the sticky header's scroll
math never fully "settling" by Playwright's strict actionability heuristic. Work around it in
tests via `page.evaluate(() => el.click())` (direct DOM click, bypasses the actionability
wait) — don't spend time trying to "fix" this as part of an unrelated change, and don't assume
a real user's click is affected (it isn't; this is a Playwright-specific interaction-stability
check, not a real rendering/click-target bug).

**Done** (2026-10-03, follow-up pass): the same glassmorphism redesign was also applied to the
live claude.ai artifact ("مسیر بورد"). Read fresh via `Artifact action:"read", page:true` first
(required before publishing to an artifact not yet read/published in-session), located its
single real `<style>` block (the file has a second, tiny inline `<style>` in `<head>` before
`<title>` — that one is part of the artifact platform's own page shell, not this app's CSS, and
was left untouched), spliced in the identical `new_style.css` content used for `docs/index.html`
(same selector names — the two files were built in parallel and share markup/JS almost exactly),
and verified byte-for-byte that everything before and after that `<style>` block was unchanged
(`node --check` on the extracted `<script>` also passed). Republished to the same artifact URL
(version 25). Its own `db`-backed item_state/meta code and the separate GitHub-sync highlight
module were not touched — only CSS moved.

## Pending cross-project follow-ups (bulk tasks not yet done)

Tracked here so a future session can pick them up without the user re-explaining, and so a
single turn's context limit doesn't quietly drop them.

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
- Condensed lesson prose per rule 4 in all 8 remaining English-sourced topics from the
  backlog: `crit/crit-vent`, `id/id-sepsis`, `gi/gi-lft`, `nephro/nephro-azotemia` (old
  Harrison-sourced sections only — the newer serum-enzymes section was left untouched, it
  was already concise), `poison/poison-general` (only its 7 original Harrison Ch470
  sections — the later Persian-sourced toxidrome/order-set sections were left untouched),
  `poison/poison-heavy-metal`, `poison/poison-snakebite`, `poison/poison-arthropod`.
  Reductions ranged ~46-63%; field counts (flashcards/mcq/kfPmp/tables) unchanged in every
  file, only `lesson[].body` text was shortened. This closes the backlog item that used to
  live here.
- Added 4 new `poison` topics from 5 official Iranian MOH clinical protocol PDFs the user
  uploaded, built in parallel by 5 background agents (one per PDF, one editing an existing
  file): `poison-alcohols` (ethanol/methanol/ethylene glycol/isopropanol), `poison-
  aluminum-phosphide` (AlP/"rice pill" — standalone deep-dive; the older brief order-table
  section in `poison-general` was left as-is, not merged), `poison-hallucinogens`, and
  `poison-antidotes` (a 37-antidote reference topic built from the 58-page antidote-therapy
  service standard — dosing/indication/contraindication data lives in grouped markdown
  tables, flashcards focus on high-yield distinguishing facts rather than one card per
  antidote). Also supplemented `poison-heavy-metal` with an aluminum-toxicity-in-dialysis
  section from a 6th, shorter protocol. Each agent's output was independently re-verified
  (field counts, جگر=0) before syncing/committing — trust the report, verify the file.
  Integration lesson: don't run `build_content_bundle.py` (or otherwise treat a topic as
  final) while a parallel build agent might still be writing that same file — a directory
  that exists on disk isn't proof an agent is done; only its actual completion report is.
  When agents are still running, defer the bundle regen and commit only the topics already
  confirmed complete, file by file.
- Added 6 more official Iranian MOH protocol PDFs across two overlapping upload batches
  (same "خلاصه، بدون حذف مفاهیم اصلی" instruction), each built by its own background agent
  and independently re-verified against the actual file before syncing/committing:
  supplemented `poison-arthropod` with an antiscorpion-venom-serum section (38→50
  flashcards), `poison-snakebite` with an antisnake-venom-serum section (42→54), `poison-
  alcohols` with a methanol acute-optic-neuropathy-care section (56→71), `poison-
  hallucinogens` with a magic-mushroom section (45→63), and `poison-opioid` with both the
  naloxone-administration service standard (38→50) and, in a second pass once the file was
  free again, the 48-page acute-opioid-poisoning protocol (50→101 flashcards — per-opioid
  subtype sections, ceiling effect, NCPE/ARDS, ICU admission/discharge criteria). Also
  built one brand-new topic, `poison-opioid-dependence` (pediatric/adolescent opioid
  dependence protocol, MOH+UNICEF), added to `TOPICS` in both `docs/index.html` and the
  live artifact HTML. Two agents in this batch (`poison-opioid-dependence` and the
  magic-mushroom `poison-hallucinogens` supplement) reported back as "failed" due to
  hitting the session's rate limit, but had already written complete, schema-valid content
  before failing — don't take a "failed" status notification as proof no work landed;
  always check the actual file on disk before deciding whether to re-run an agent. (The
  third failed agent, the 48-page opioid protocol, genuinely hadn't written anything and
  was re-launched from scratch.) `docs/content-bundle.json` regenerated once (40 topics)
  only after every agent's real output was confirmed, per the lesson above.
- Supplemented `poison-aluminum-phosphide` (35→45 flashcards, 10→13 MCQs, 3→4 tables, 8→11
  lesson sections) from two new sources: a 2024 Iranian Journal of Toxicology RCT
  (Samsaam Shariat/Gheshlaghi/Zoofaghari) on plasmapheresis in AlP poisoning — finding it
  raised HCO3 significantly at 12h but did not reduce mortality (27.3% vs 24.1%, not
  significant) — and Persian clinical teaching notes (Loghman Hospital experience) covering
  the AlP hydrolysis chemistry and why dissolve-then-drink vs. swallow-then-lavage changes
  severity, RSI drug choice (etomidate preferred, avoid thiopental, ketamine/awake-intubation
  tradeoffs in progressive hypotension), 1:10000 dilution of potassium permanganate before
  gastric lavage, central-line administration of caustic antioxidant drugs, insulin's
  cardioprotective/inotrope rationale (generalizable to other cardiotoxic poisonings), and
  the VBG calibration formula. Confirmed the re-uploaded official MOH protocol PDF was the
  same source already used to build the topic (no new content from it); the genuinely new
  content came from the RCT and the teaching notes. Synced to the artifact db (version 1→2),
  bundle regenerated to 42 topics.
- Added the user-clarified COHb-based GIK threshold ("co level" in the teaching notes meant
  carboxyhemoglobin) to `poison-aluminum-phosphide` as a flashcard + lesson addendum, but
  explicitly caveated: phosphine doesn't bind hemoglobin the way CO does, so COHb isn't part
  of AlP poisoning's known pathophysiology or the official MOH protocol — flagged as an
  institutional/experiential threshold, not an evidence-based or board-standard criterion.
  Synced (version 2→3).
- Supplemented `poison-aluminum-phosphide` again (46→56 flashcards, 13→15 MCQs, 4→5 tables,
  11→12 lesson sections) from Goldfrank's Toxicologic Emergencies' "Metal Phosphides and
  Phosphine" section (used only the phosphide-relevant part of that chapter — methyl
  bromide/dichloropropene/sulfuryl fluoride/methyl iodide sections of the same chapter were
  out of scope and skipped): zinc/calcium/magnesium phosphide (same PH3-release mechanism,
  own toxic doses), occupational exposure limits (REL/STEL/IDLH) and phosphine's LEL,
  phosphine-hemoglobin chemistry (Heinz bodies/hemichromes), APACHE/SAPS prognostic scores,
  a second lactate-mortality study with different cutoffs/timepoints than the one already in
  the topic (kept both, flagged as distinct studies rather than merged into one "the"
  number), NAC/vitamin E outcome data (specific mortality-reduction percentages), and a new
  table of investigated-but-not-routinely-recommended therapies (liothyronine, IV lipid
  emulsion, atropine/pralidoxime, hyperbaric oxygen, HDI). This pass also caught and fixed a
  real evidence conflict from the previous session's Loghman-teaching-notes addition: the
  potassium-permanganate 1:10000-dilution gastric lavage flashcard/lesson paragraph had been
  added as a plain practical technique, but Goldfrank's explicitly states neither that
  approach nor boric acid is recommended (risks without proven benefit) — both spots now
  carry that caveat instead of presenting the institutional practice as consensus. Synced to
  the artifact db (version 3→4).
- Built and added the first real entry in any topic's `images` field: an original one-page
  infographic for `endo-wilson` (pathophysiology flow, clinical findings by organ system,
  diagnostic workup, exam pearls, treatment algorithm — all drawn from that topic's existing
  flashcards/lesson, nothing new invented). See the new "Generating a custom infographic..."
  section above for the full method and the hosting tradeoffs worked out along the way
  (Drive base64 upload is impractical — ~170K tokens just to read back a ~180K-char base64
  string at this tokenizer's apparent ~1 token/char rate for base64; Artifact asset blobs
  are private, confirmed 403 on an unauthenticated curl; data: URI embedded directly in
  `images[].sourceUrl` is what actually works for an unauthenticated link from the static
  site, verified byte-for-byte via SHA-256 before/after). Synced to the artifact db
  (version 3→4, now ~221/256 KiB — tight headroom for this topic).
- Redesigned `docs/index.html`'s entire visual system ("Premium Medical SaaS Glassmorphism" —
  navy/cyan glass palette, floating pill nav, Bento cards, segmented controls) as a CSS-only
  change — rewrote just the `<style>` block, verified the rest of the file (full HTML body +
  entire `<script>` block: auth, GitHub sync, state, highlights, checkboxes, flashcards/MCQ/
  KF-PMP rendering) is byte-for-byte identical to before. See the new "UI design system for
  docs/index.html" section above for the design tokens, what was deliberately left out
  (no fake bento cards with no backing data, no circular progress, no invented nav items),
  and a Playwright testing quirk discovered along the way (pre-existing on the original file
  too, not caused by this change). Live artifact not touched — static site only, per the
  request.
- Applied the identical glassmorphism redesign to the live claude.ai artifact ("مسیر بورد"),
  per the user's immediate follow-up request. Same CSS-only splice technique, same source
  CSS file, verified byte-for-byte unchanged outside the `<style>` block. Republished
  (version 25). See the updated "Not yet done" → now "Done" note in the UI design system
  section above.
- Four small UI changes, applied identically to `docs/index.html` and the live artifact
  (republished version 26, also renamed to "IntMed" on claude.ai): (1) renamed the app from
  "مسیر بورد" to **IntMed** everywhere it appears as the site name (`<title>`, header `<h1>`,
  login card heading on `docs/index.html`) — other Persian copy (GitHub modal text, footer,
  etc.) was left alone since it's not the site name. (2) Added a **manual dark/light toggle**
  (🌙/☀️ button in the header, id `themeToggleBtn`): previously the existing dark-mode CSS
  tokens only ever followed `prefers-color-scheme`, with no way to override it. Stored in
  `localStorage["bp_theme"]` (`"dark"`/`"light"`/absent=auto), applied via
  `document.documentElement.setAttribute("data-theme", …)` — this reuses the CSS variable
  system that was already there (`:root[data-theme="dark"]` / `:root:not([data-theme="light"])`
  + the media query), so no new CSS tokens were needed, only the toggle logic + button markup/
  style. In `docs/index.html` this lives in the login-gate IIFE (applied before the login
  reveal, so the login card itself also respects it, no flash of wrong theme); in the artifact
  (no login gate) it's its own small IIFE at the top of the main script. (3) **Split the
  "هایلایت‌های من" button** out of the row of content-type pills (`درسنامه`/`فلش کارت نکات`/
  `آزمون ۴ گزینه‌ای`/`KF & PMP`/`تصاویر مهم`/`جداول مهم`) into its own row (`.learn-row-
  highlights`, with a `.learn-row-highlights-label` caption above it) below a dashed divider —
  it's a different kind of thing (personal annotations) from the static content types, so it
  reads that way now instead of being just another pill in the same row. Both rows still
  toggle the same shared `learnPanel` and clear each other's `.active` state on click (handled
  in `LEARN_TYPES.forEach`, routing the `"highlights"` key to `hlRow` instead of `learnRow`).
  (4) **Enlarged the highlight color swatches** (`.hl-swatch`: 22px→36px, border 1px→2px) and
  the note button (`.hl-note-btn`) in the floating selection toolbar, plus more toolbar
  padding/gap — easier to tap accurately on a phone screen. Verified via local Playwright
  renders (dashboard, dark toggle, highlight-row split, enlarged toolbar) before committing/
  publishing. `SendUserFile` sent per the standing notification rule.
  **Follow-up same day**: the user said 36px was too big after seeing it live, so the
  swatches were brought back down to **26px** (border 2px→1.5px, toolbar padding/gap reduced
  to match) — a middle ground between the original 22px and the overcorrected 36px. If asked
  to resize again, 26px is the current baseline, not 22px or 36px.

## Logo/favicon, header clock, and the ventilator scenario module (added 2026-10-03)

**Logo**: the user pasted a PNG logo (abstract dark-charcoal "A"/mountain-peak monogram,
transparent background, 1718×1193) as a **mid-turn image attachment**, which does not appear
in this session's normal `uploads/` directory and isn't reachable via the `message.content`
path the way a turn-opening image is — the raw base64 only shows up under the JSONL
transcript event's `attachment.prompt[].source.data` field, written in a `queued_command`
entry whose `timestamp` has to be matched against when the message actually arrived (cross-
check by image byte-length/media_type, not just presence). Extracted it by writing a Python
script that opens the session's own `*.jsonl` transcript file (path: `/root/.claude/projects/
<project-slug>/<sessionId>.jsonl`), finds the matching `attachment.prompt[]` block, and
`base64.b64decode()`s straight to a PNG file on disk — **never** retype/reconstruct the
base64 by hand through a tool-call parameter (the Gmail-attachment postmortem elsewhere in
this file explains why); verified via SHA-256 logged at decode time. If a future session
needs to pull a pasted image that isn't in `uploads/`, grep the live `.jsonl` for
`"type":"queued_command"` near the message's timestamp and decode the same way.

Processing: `PIL.Image.getbbox()` to confirm no transparent padding to trim (there wasn't),
padded to a square canvas (8% margin) so it crops cleanly to a circle, downscaled to 256×256
(`Image.LANCZOS`), saved to **`docs/assets/logo.png`** (~16KB) — this is the one file used
for all three placements (header badge, login-card badge, `<link rel="icon">`/
`apple-touch-icon` favicon) and also published as a supporting file (`files` param) alongside
the artifact HTML at the same relative path `assets/logo.png`.

**The "green halo" pattern** (`.logo-badge` / `.logo-badge.logo-badge-lg` for the bigger
login-card version): a circular radial-gradient glow behind the logo image, built from
`color-mix(in srgb, var(--accent) N%, transparent)` — reusing the exact technique already in
this file for `.cat-dot`'s halo (`box-shadow:0 0 0 3px color-mix(...)`), not a new color
token. This exists because the logo itself is dark/charcoal and would nearly vanish against
the dark-mode background (`--bg:#0a0f1c`) without it — the halo's `--accent` swap between
light/dark themes (teal `#0f99a6` → brighter cyan `#35d8e6`) keeps it visible in both. Applied
in three places in `docs/index.html` (header `.title-row`, inside `#loginForm`'s `.login-card`
next to "ورود به IntMed") and one place in the artifact (header only — the artifact has no
login gate). Same CSS/markup pattern in both files, same `assets/logo.png` reference.

**Follow-up same day**: the user asked for the badge bigger and the halo changed from the
accent-colored glow to **white, ~35% opacity, `mix-blend-mode:overlay`, glass** — `.logo-badge`
went 36px→46px (header) / 56px→78px (login-lg); the halo is now a plain
`rgba(255,255,255,.35)` circle with `backdrop-filter:blur(10px)` and
`mix-blend-mode:overlay`, applied only to the `::before` pseudo-element (not the `.logo-badge`
element itself) so the blend mode affects just the glow layer, not the `<img>` painted after
it — putting the blend mode on the parent would blend the logo image too and wash it out.
Overlay blend math means this reads differently per background: a soft visible glass highlight
against the translucent header surface, much subtler against solid white (login card) or
near-black (dark mode) — that's inherent to how overlay blend works against very light/dark
backdrops, not a bug. Republished as version 28.

**Second follow-up, same day**: exactly the predicted weak spot above turned out to matter —
in dark mode the overlay-blend halo was too washed out and the dark logo mark was nearly
invisible against the near-black header. Per the user's explicit ask ("لوگو... بازم بزرگتر...
در دارک مود لوگو معلوم نمیشه"), **dropped `mix-blend-mode:overlay` entirely** and replaced the
`::before` halo with a near-opaque white disc (`rgba(255,255,255,.92)`, no blend mode, plain
`backdrop-filter:blur(10px)` + border + drop shadow) — reliable contrast in both themes beats
a blend-mode glass effect that only works against one kind of background. Sized up again:
`.logo-badge` 46px→58px (header) / 78px→96px (login-lg). If asked to make the badge "glassy"
again, reconsider blend modes only with an explicit test against the dark-mode background
first — `mix-blend-mode:overlay`/`soft-light`/etc. against a near-black backdrop will have the
same washed-out problem by construction, not just for this particular white color choice.
Republished as version 29.

**Third follow-up, same day**: the solid white disc from the previous pass then drew the
opposite complaint — "این بخش سفید رنگ خیلی توی ذوق میزنه" (the white part is too jarring/
blocky), plus "خود آیکون png را بزرگتر کن نه solid رنگ زیر آن را" (enlarge the icon itself,
not the solid-color backdrop), and an explicit pointer back to the very first version's shape:
"مثل حالت اول که آبی ساختی اما سفید باشه" (like the first [accent-colored] version, but
white). **Went back to the original radial-gradient structure** (the one before any of these
three follow-ups — see the "green halo" paragraph above): both `.logo-badge`'s own background
and its `::before` are `radial-gradient(circle, ...)` fading to transparent, no flat/solid
fill anywhere, no `mix-blend-mode`, no `backdrop-filter`/border/box-shadow glass trick — same
shape as the first version, just `rgba(255,255,255,...)` in place of
`color-mix(in srgb, var(--accent) ...)`. This reads fine in dark mode too (confirmed via
screenshot) since a translucent white gradient against near-black is visible on its own,
without needing a blend mode or a solid disc to force contrast — the earlier two follow-ups'
problems were specific to *those* techniques (overlay blend, opaque disc), not to white itself.
Icon fill bumped 78%→90% of the badge (the actual ask: make the icon bigger, not just the
badge); badge 58px→64px (header) / 96px→108px (login-lg). **If the halo needs further tuning,
start from this radial-gradient version, not from the disc or overlay-blend ones** — both were
explicitly rejected by the user. Republished as version 30.

Also confirmed while handling this (no code change needed): the per-user display name in the
header, `#userLabel`, already shows whichever of the three accounts (`amir`/`arash`/
`alisalehi`) is currently logged in via `USER_NAMES[CURRENT_USER_ID]` — this was built during
multi-user support (see that section above) and the user's "نام کاربری... نشون داده بشه" ask
was already satisfied; verified by logging in as `arash` locally and confirming "آرش" renders.

**Site rename**: "مسیر بورد" → **IntMed**, per explicit user instruction, wherever it serves
as the app's own name (`<title>`, header `<h1>`, the login card's "ورود به ..." heading) —
left alone everywhere else (GitHub modal copy, footer text, etc., which were never the site
name to begin with).

**Header clock** (`#headerClock`, small muted text line between the title-row and the
progress bar, `.header-clock` class — `font-size:.68rem`, `color:var(--ink-faint)`): shows
Persian weekday + Jalali date + time, e.g. "شنبه، ۱۱ مهر ۱۴۰۵ — ساعت ۲۰:۱۷". Built entirely
with `Intl.DateTimeFormat` (`"fa-IR"` for weekday/time, `"fa-IR-u-ca-persian"` for the Jalali
calendar date) — **no hand-rolled Gregorian→Jalali conversion math**, since modern browsers'
ICU data already does this correctly via the locale/calendar extension. Updates every 30s via
`setInterval`. Present in both `docs/index.html` (in the second/main app IIFE, since
`#headerClock` only exists inside `#appRoot`) and the artifact (its own small IIFE, same
function body). Deliberately small/muted per the user's explicit ask ("نه خیلی بزرگ... به
جلوهٔ بصری آسیب نرسه") — it's a subtitle under the brand, not a pill competing with the
header's other controls.

### New content type: `ventSim` (ventilator/BiPAP/CPAP scenario module)

The user asked for a ventilator module beyond plain lesson/flashcard content — something that,
given a disease (they named ARDS, COPD, CVA, TB as the must-have set), shows how to operate
the vent/BiPAP/CPAP and what settings to use, with an example ABG/VBG. Before building,
clarified two genuinely different interpretations via `AskUserQuestion`: (a) a curated,
scenario-driven decision guide (pick a disease → see settings/rationale/example gas/titration
rules — static content, no physiology engine) vs. (b) a true interactive simulator where
slider-adjusted vent settings feed a simplified physiological model that computes a resulting
ABG live. **User picked (a)** — explicitly flagged (b) as "ریسک: هر مدل ساده‌شده جایی خطا
داره" (a simplified physiology model is itself a source of error) and said curated data is
more trustworthy. **Do not build (b) without the user explicitly asking for it again** — it's
a fundamentally different (and much larger) engineering task, not an incremental extension of
this module.

**Schema**: added `ventSim` (array) to `content/_schema/topic-content.schema.json`, alongside
the existing `flashcards`/`mcq`/`kfPmp`/`images`/`tables`/`lesson` fields. Each scenario:
`{id, disease, riskFactors[], supportType, indicationNote, mode, initialSettings:{FiO2, PEEP,
tidalVolume, respiratoryRate, ipap, epap, other[]}, rationale, exampleAbgVbg:{ph, paco2, pao2,
hco3, interpretation}, titrationSteps:[{trigger, action}], pitfalls[]}` — the renderer only
shows whichever of these fields are actually present, so not every scenario needs every field
(e.g. only the COPD/BiPAP scenario sets `ipap`/`epap`).

**Content**: built 4 scenarios for `content/crit/crit-vent/data.json` — ARDS (ARDSNet lung-
protective ventilation, PEEP/FiO2 titration before increasing FiO2 further, permissive
hypercapnia, prone positioning), COPD exacerbation (BiPAP first-line per pH thresholds,
IPAP/EPAP titration, O2 target 88–92% specifically because over-oxygenating worsens
hypercapnia, auto-PEEP/breath-stacking risk after intubation), CVA/raised-ICP (airway
protection rather than primary respiratory failure, normocapnia as the target — explicitly
contrasted against ARDS's permissive-hypercapnia strategy, since treating a neuro patient like
an ARDS patient is a real failure mode worth calling out, transient hyperventilation only as a
bridge during herniation), and TB (combines ARDS-like lung-protective settings for miliary/
disseminated disease *and* full airborne-isolation requirements — negative-pressure room,
N95/PAPR, HME/HEPA filter on the expiratory limb, closed suctioning, MDI-in-circuit instead of
open nebulizers; explicitly framed as "the management difference here is infection control,
not blood gas targets"). Each scenario deliberately contrasts with at least one other to
surface the actual teaching point (e.g. ARDS tolerates hypercapnia, CVA cannot).

**Rendering**: `ventSim` added to `LEARN_TYPES` with a new `onlyFor:["crit-vent"]` field —
`LEARN_TYPES.forEach` now skips building a button for any `lt.onlyFor` array that doesn't
include the current topic id, so this tab only appears on `crit-vent`, not on every topic (the
established pattern for topic-specific learn-types going forward: add `onlyFor`, don't hardcode
the topicId check elsewhere). New render branch in `renderLearnPanel` builds one `.vent-card`
per scenario: `.vent-head` (disease title + `.vent-badge` support-type pill), `.vent-risk`,
`.vent-indication`, a `.vent-settings-grid` (2-col responsive grid of FiO2/PEEP/IPAP/EPAP/Vt/RR
— only non-empty fields render), `.vent-other-list`, `.vent-rationale` (accent-bordered callout
box), a `.vent-abg-grid` (4-col responsive grid) + `.vent-abg-interp`, `.vent-titration-row`
list (trigger → action pairs), and a `.vent-pitfall-list` (red text, `.vent-subtitle-warn`
heading) — same markup/CSS/JS in both `docs/index.html` and the artifact, verified via local
Playwright render of the ARDS card before syncing.

**Sync note**: discovered while re-syncing `crit-vent` that the live artifact db document for
this topic is shaped exactly `{id: "crit-vent", data: {flashcards, mcq, kfPmp, images, tables,
lesson}}` (confirmed by reading it with `ArtifactData action:"get", out_dir:...` and inspecting
the saved JSON file's actual key structure in Python — **don't trust the tool's inline text
dump of a large document for structure; a get's printed form can interleave content with the
tool's own `version`/metadata fields in a way that reads as nested when it isn't; save to a
file and inspect that instead**). Used `action:"set"` with the full reconstructed document
(all existing fields plus the new `ventSim` array) and `if_version` pinned to what `get` showed,
not `action:"update"` — an `update` on this doc would have **replaced the whole top-level
`data` field**, wiping every existing field except whatever was included, since this db's
"update" merges at the top level of the document (keys `id`/`data`), not deep inside `data`.

Also added `"ventSim"` to `FIELDS` in `scripts/build_content_bundle.py` so it carries through
to `docs/content-bundle.json` (the static-site fallback) and regenerated the bundle.

**Follow-up, next day (2026-10-04): collapsible cards + 4 more scenarios.** The initial 4
scenarios all rendered fully expanded in sequence, making the panel ~9400px tall on one
screenshot — the user asked for each one to be its own expandable bar, plus more scenarios
("RSI در اورژانس یا مسمومیت یا ICU"). Restructured each `.vent-card` into the same
open/closed accordion pattern already used by `.phase`/`.topic-cat` elsewhere in the app:
`.vent-head` (now `.vent-head-left` wrapping title+badge, plus a `.vent-chev` chevron) is a
`cursor:pointer` toggle that flips `.vent-card`'s `open` class; everything that used to hang
directly off `card` now lives in `.vent-body > .vent-body-inner` (`max-height:0` → `20000px`
on `.open`, same transition timing as `.phase-body`). Cards toggle **independently**, not
mutually-exclusive — opening one doesn't close another, matching `.phase`/`.topic-cat`. The
first scenario (`scIdx===0`) opens by default so the tab isn't empty-looking on first view;
the rest start collapsed. Verified via Playwright: 8 `.vent-card`s render, exactly 1 open by
default, both independent-open and panel-height-shrunk-when-collapsed confirmed.

Added 4 more scenarios (total now 8), deliberately chosen for physiological contrast with the
first 4 and with each other, not just "more of the same":
- `rsi-general` — generic safe initial settings **immediately after ED RSI**, before the
  underlying diagnosis is known. Teaching point: in the first minutes, the real risk is
  peri-intubation hypotension/hypoxia and tube-position confirmation, not fine ventilator
  tuning — treat these settings as a temporary default, re-triage to the matching specific
  scenario (ARDS, COPD, a poisoning, etc.) the moment a diagnosis is clear.
- `poisoning-salicylate` — **the** classic poisoning/ventilator teaching point: severe
  salicylate toxicity drives a deep compensatory respiratory alkalosis, and intubating these
  patients is dangerous because the apnea/induction period interrupts that compensation and
  pH can crash. If intubation is unavoidable, match or exceed the patient's own pre-intubation
  minute ventilation — explicitly the **opposite** of ARDS's permissive-hypercapnia strategy,
  called out as such.
- `icu-shock-rsi` — intubating a patient already in septic/hypovolemic shock: positive-pressure
  ventilation's effect on venous return/preload as the central hemodynamic teaching point
  (peri-intubation cardiac arrest risk), not primarily a lung-mechanics scenario at all.
- `poisoning-opioid-resp` — pure hypoventilation respiratory failure with essentially normal
  lung mechanics (no V/Q mismatch like ARDS, no air-trapping like COPD, no ICP consideration
  like CVA) — deliberately placed to contrast with the other scenarios' physiology; also covers
  naloxone-first management and opioid-associated noncardiogenic pulmonary edema as a watch-for.

Content built the same way as the first 4 (own Python build script in scratchpad, same field
shape per the schema, جگر-checked, schema-validated). Bundle regenerated, `crit-vent` db doc
re-synced in full via `action:"set"` (not `update`, same reason as above) — version 3→4 — and
the artifact republished (version 31).

## Nephro/cardio/GI content batch (2026-10-04)

Four parallel background-agent builds from user-uploaded PDFs/handwritten notes, each
independently re-verified (schema, جگر grep, field counts) before committing, then synced to
the artifact db in one batch and the bundle regenerated to 45 topics:

- **`nephro-gn`** (new topic): glomerulonephritis, built from a 5-page handwritten outline.
  57 flashcards, 17 mcq, 4 kfPmp, 6 tables, 12 lesson sections. Covers the nephrotic/nephritic
  split, MCD/FSGS/membranous, IgA/PSGN/RPGN (3 mechanisms)/MPGN/lupus nephritis. Synced as a
  new db doc (version 1).
- **`nephro-lytes`** (supplemented): added hyponatremia content from 4 pages of handwritten
  Persian lecture notes — hypovolemic/hypervolemic/euvolemic classification, cerebral salt
  wasting, 4 Robertson SIADH subtypes, osmotic demyelination syndrome. 42→68 flashcards,
  34→48 mcq, 2→4 kfPmp, 4→6 tables, 11→16 lesson. Pre-existing content confirmed
  byte-identical before the add. Synced version 1→2.
- **`cardio-cardiomyopathy`** (supplemented): added DCM genetics, ARVC, HOCM/SAM mechanism +
  athlete's-heart differential, Fabry/Danon as HCM mimics, from handwritten Persian lecture
  notes (not English-sourced, so rule 4 condensation didn't apply). 15→37 flashcards, 10→16
  mcq, 2→3 kfPmp, 2→4 tables, 5→10 lesson. Pre-existing HCM sudden-death-criteria content left
  as-is. Synced version 1→2.
- **`gi-pancreatitis-acute`** / **`gi-pancreatitis-chronic`** (both new, split from the single
  `gi-pancreatitis` taxonomy placeholder per the user's explicit "دو فص جدا" request — taxonomy
  edit done as its own prior step in both `docs/index.html` and the artifact HTML before any
  content existed, matching the pattern used for `nephro-gn`/`poison-beta-blocker`). Acute: 36
  flashcards, 14 mcq, 3 kfPmp, 5 tables, 8 lesson — Ranson (11 criteria)/BISAP (5 items)/
  Balthazar-CTSI (grades A–E + necrosis, max 10) tables personally re-verified byte-for-byte
  against the user's handwritten scoring-criteria image, plus standard Atlanta-criteria/
  etiology/management content. Chronic: 36 flashcards, 12 mcq, 3 tables, 4 tables, 8 lesson —
  **caveat**: the source PDF turned out to be only 3 pages of sparse handwritten telegraphic
  notes, not a full chapter as assumed when scoping the build, so this topic leans much more
  heavily on supplemented standard board-level knowledge (TIGAR-O classification, autoimmune
  pancreatitis types 1/2, Cambridge imaging classification, fecal elastase, PERT dosing, pain
  ladder) than the other three builds in this batch, which stayed closer to their source
  material. Both synced as new db docs (version 1).

Integration note: `isolation:"worktree"` was used for one agent in this batch and left a
leftover `.claude/worktrees/` directory as untracked state in the main checkout — fixed via
the new root `.gitignore` (`.claude/`). Subsequent agents in the batch ran without isolation
(shared checkout) to avoid repeating it.

## `poison-beta-blocker` (2026-10-04)

Separate, later-timed background-agent build (not folded into the batch above) from two PDFs:
`Beta_blocker_poisoning.pdf` — an English UpToDate chapter (receptor pharmacology, MSA/
lipophilicity/ISA framework, drug-specific toxicity for sotalol/acebutolol/carvedilol,
4-way differential diagnosis, stepwise escalating treatment algorithm: glucagon → calcium →
vasopressor → HIET → methylene blue → lipid emulsion → bicarbonate/magnesium/pacing/IABP/
ECMO, 66 citations) — and a 63-slide Persian clinical-teaching deck by Dr. Behrouz Hashemi
(not a formal MOH protocol despite its filename implying one; independently confirmed by the
agent's own source check). 98 flashcards, 16 mcq, 3 kfPmp, 5 tables, 16 lesson sections.

The Persian deck contributed genuinely new content absent from the English chapter: an
Iran-specific drug formulary table (brand names/strengths per drug), a vagal-stimulation
caution for NG-tube placement, a lidocaine fallback step after failed bicarbonate,
aminophylline as a last-resort option (narrow therapeutic index flagged as its real
limitation), a distinct 10%-concentration lipid-emulsion protocol, and — the standout,
board-relevant point the English source doesn't cover at all — systemic beta-blocker toxicity
(bradycardia/AV block/bronchospasm) from topical timolol eye drops via nasolacrimal
absorption. Where the two sources gave differing numeric protocols for the same intervention
(methylene blue, lipid emulsion), both were kept and flagged as distinct rather than merged
into one number — same pattern as `poison-aluminum-phosphide`'s dual lactate-cutoff handling.

Flashcard count (98) is well above this repo's usual 40-60 target; independently re-verified
(not just trusted from the agent's report) that this reflects genuine source breadth — no
duplicate ids, no duplicate facts on manual sampling — rather than padding, so it was left
as-is. Independently validated: schema passes, 0 جگر occurrences, flashcard front→back
direction consistent across a random sample, no rule-3 sentence-grammar breaks (a broad
Latin/Persian-character-adjacency scan only turned up normal abbreviation-next-to-punctuation
patterns, e.g. "ISA)"، "AV؛", never an actual grammar break). `TOPICS` entry for this topic
was already added in a prior step this session (commit `5c62a85`), so no taxonomy/artifact-
HTML edit was needed here. Synced to the artifact db as a new doc (version 1). Bundle
regenerated to 46 topics.

## Second nephro content batch: AKI, CKD-MBD, candiduria, catheter infection (2026-10-04)

Four more nephro topics, all from the user's own handwritten notes (two PDFs the user had
assumed were printed chapters turned out to be handwritten scans too, same as everything else
this session) plus two standalone handwritten images sent in a later message. Taxonomy entries
for `nephro-aki` and `nephro-ckd` had already been added to `TOPICS` in both `docs/index.html`
and the artifact HTML in an earlier, unlogged step this session — found already present when
starting this work, so their `topicId`s were picked to match what was already there rather than
invented fresh.

- **`nephro-aki`** (new, background agent, independently re-verified): contrast-associated
  AKI definition, the Mehran score (= CIN risk score) with full point table and the CIN-score→
  AKI-risk/dialysis-risk table — hand-checked byte-for-byte against my own transcription of the
  source handwritten image, matched exactly. Supplemented with KDIGO AKI staging, the AEIOU
  dialysis-indication mnemonic, CIN prevention strategies (N-acetylcysteine explicitly framed
  as evidence-uncertain, not proven), capillary leak syndrome (OHSS/sepsis as causes), and
  analgesic nephropathy (explicitly framed as primarily a CKD etiology despite being filed
  under this AKI topic in the source notes — the lesson prose says so directly rather than
  misrepresenting it as a typical acute cause). Rhabdomyolysis kept to a 1-2 sentence
  cross-reference to the existing `rhabdo-myopathy` topic rather than duplicating it. 47
  flashcards, 14 mcq, 3 kfPmp, 4 tables, 10 lesson sections. The agent caught and fixed two of
  its own internal-consistency bugs during self-review (a Mehran-score arithmetic mismatch in
  one MCQ, a self-contradicting KF/PMP answer) before handing back — reported transparently
  rather than silently, which is exactly the kind of thing to check for when re-verifying
  agent output generally.
- **`nephro-ckd`** (new, background agent): CKD-MBD (PTH/Ca/P targets and the calcitriol vs.
  cinacalcet directionality — vitamin D analogs raise Ca and suppress PTH for high-PTH states,
  cinacalcet lowers PTH without raising Ca, preferred when Ca is already high — this exact
  distinction was flagged in the build brief as the most likely place to get backwards),
  anemia/iron/ESA targets, diuretic-resistant edema management, the ACEI/ARB-in-CKD nuance
  (renoprotective in earlier stages, held during AKI/hyperkalemia, permanent discontinuation
  in very advanced CKD is individualized/controversial — not a flat rule), secondary/tertiary
  hyperparathyroidism progression (brown tumors, salt-and-pepper skull, adynamic bone disease),
  AF/anticoagulation and calciphylaxis in ESRD, PD peritonitis/exit-site/tunnel infection, UF
  rate limits, dialysis adequacy (URR/Kt-V), and dialysis disequilibrium syndrome.
- **`nephro-lytes`** (supplemented directly, not via agent — small bounded addition): the
  renin/aldosterone-based differential for hypertension with hypokalemia, from a standalone
  handwritten image — primary hyperaldosteronism, renovascular disease/fibromuscular dysplasia
  (the "string of beads" sign), Liddle syndrome, apparent mineralocorticoid excess (added as a
  close differential to Liddle even though not in the source, since the two are a classic
  paired board distinction — both have low renin/low aldosterone, but AME responds to
  spironolactone and Liddle doesn't), Cushing syndrome, and Bartter vs. Gitelman. 68→80
  flashcards, 48→50 mcq, 6→7 tables, 16→17 lesson.
- **`nephro-candiduria`** (new, built directly, not via agent): from a second standalone
  handwritten image whose placement was NOT obvious — it wasn't named with `@` in the user's
  message text alongside the two PDFs, and its content (catheter-associated candiduria,
  fluconazole dosing, IDSA high-risk treatment criteria) is arguably more ID/urology than core
  nephro. Asked the user directly via `AskUserQuestion` rather than guessing; they chose "new
  dedicated chapter in nephrology." Built from the handwritten skeleton + IDSA 2016 candidiasis
  guideline supplementation (when to treat asymptomatic candiduria, fluconazole regimen,
  catheter-removal nuance, resistant-organism alternatives, candidemia contrast). 9 flashcards,
  2 mcq, 1 kfPmp, 1 table, 3 lesson sections — intentionally smaller than other topics since the
  source and the standard-knowledge scope here are both genuinely narrower.
- **`nephro-catheter-infection`** (new, built directly, not via agent, same session later
  request from two more standalone handwritten images): covers CAPD/PD peritonitis (diagnosis
  threshold WBC>100+PMN>50%, empiric IP antibiotics with the vancomycin-overuse caveat,
  48-96h catheter-removal rule, and the fungal-peritonitis exception where catheter removal is
  immediate rather than contingent on treatment response) and hemodialysis catheter
  types/complications (tunneled vs. non-tunneled, the infection/thrombosis/stenosis triad, SVC
  syndrome from chronic central-line thrombosis/stenosis — including why subclavian catheters
  are avoided over internal jugular in future-fistula candidates).
- **`nephro-ckd`** (new, background agent, independently re-verified, including the two
  clinical-directionality risk areas flagged in the build brief — both confirmed correct):
  calcitriol/paricalcitol (raise Ca, suppress PTH, for high-PTH states, avoided when
  low-turnover/adynamic risk is present) vs. cinacalcet (lowers PTH without raising Ca,
  preferred when Ca is already elevated); and the ACEI/ARB-in-advanced-CKD nuance, correctly
  citing the STOP-ACEi (2022) trial rather than presenting a flat stop/continue rule. 70
  flashcards, 17 mcq, 4 kfPmp, 6 tables, 14 lesson sections as delivered.

**Overlap found and resolved**: `nephro-ckd`'s own PD-peritonitis section (built from an
earlier, terser mention in its own source PDF) substantially duplicated
`nephro-catheter-infection`'s deeper treatment of the same material — 8 flashcards, 2 mcq, 1
kfPmp, and 2 tables' worth of near-identical content (PD peritonitis diagnostic threshold,
empiric IP antibiotics, exit-site/tunnel infection, catheter malposition). Trimmed all of it
out of `nephro-ckd` down to a short overview paragraph plus an explicit cross-reference
flashcard and lesson sentence pointing to `nephro-catheter-infection`, matching the existing
rhabdomyolysis cross-reference pattern elsewhere in this file — final `nephro-ckd` counts:
63 flashcards, 15 mcq, 3 kfPmp, 4 tables (down from 70/17/4/6 as the agent delivered it).

All five independently re-verified (schema validation, جگر grep, duplicate-id check,
flashcard-direction spot-check, plus the overlap check above) before committing — agent
reports trusted as a starting point, never as the final word. Taxonomy entries added for
`nephro-candiduria` and `nephro-catheter-infection` in both `docs/index.html` and the artifact
HTML (republished version 34, then 35); `nephro-aki`/`nephro-ckd` entries were already present.
Synced to the artifact db in three batches (`nephro-candiduria` alone, `nephro-aki`+
`nephro-catheter-infection` together, `nephro-ckd` alone once it landed and was trimmed).
Bundle regenerated to 50 topics across two passes (49 after the first four topics, 50 once
`nephro-ckd` was verified and trimmed).

## Collapsible header toggle (added 2026-10-05)

The top nav bar (logo/title, connection-status pill, theme toggle, GitHub-connect button,
progress bar, dashboard/education tabbar) was taking up real screen space while actually
reading a lesson on a phone. Added a small chevron button (`.header-collapse-btn`,
id `headerCollapseBtn`) that toggles a `collapsed` class on `header.top`, shrinking it down
to a single compact line (logo + "IntMed" + the Jalali clock) and expanding it back on a
second click.

**Structural change**: `#headerClock` moved from its own line below `.title-row` into the
`.brand` span itself (inline, right after `<h1>IntMed</h1>`) — this is what lets the
collapsed state read as one line rather than two, since logo/title/clock were already
rendered together in `.title-row`. Its CSS lost `margin-top:7px` (no longer needed as a
standalone block) and gained `display:inline-flex` plus a small `—` separator via
`::before`. The conn-status/theme-toggle/GitHub-connect/logout buttons were wrapped in a new
`.title-row-extras` span (`id="titleRowExtras"` in `docs/index.html`, which also has
`userLabel`/`logoutBtn` there that the artifact doesn't, since the artifact has no login
gate) that hides via `header.top.collapsed .title-row-extras{display:none}`; the toggle
button itself lives in a sibling `.title-row-right` span so it's never hidden by its own
collapse. The progress bar and tabbar were wrapped in a new `.header-collapsible` div
(`id="headerCollapsible"`) that collapses via the same `max-height:0` accordion pattern
already used for `.phase-body`/`.vent-body` elsewhere in this file (large fixed max-height
when open, 0 when `.collapsed`, both with a `.35s` transition) — no JS height measurement
needed, consistent with the rest of the codebase's accordion components.

**State is transient, not persisted** — no `localStorage` key, unlike the theme toggle. It
only needs to survive while the tab stays open on a topic (which is the actual use case:
collapse it, read, maybe flip back later in the same sitting); a fresh page load reasonably
starts expanded again, and persisting it would've meant one more piece of per-device state
to manage for no real benefit here.

**`docs/index.html` wiring note**: this file's login-gate IIFE used to be one single IIFE
wrapping both the theme-toggle logic and everything after it (GATE_USERS, login form
handling, etc.). Rather than inserting the header-collapse logic awkwardly mid-IIFE, the
theme-toggle block was closed into its own IIFE (`})();` added right after it) and the
header-collapse toggle became its own small IIFE immediately after — the GATE_USERS/login
code that used to follow inside the same closure now runs inside the header-collapse IIFE's
closure instead, which is harmless since it never referenced anything from the theme-toggle
IIFE's local scope (`getStoredTheme`/`applyTheme`/etc. were never used anywhere else).
Verified via `node --check` on the extracted `<script>` block, both before and after, and
confirmed no downstream code referenced those theme-toggle-local functions before making the
split. In the artifact (no login gate, theme toggle already lives in its own small IIFE
inside the main app IIFE), this wasn't an issue — the new header-collapse IIFE was just
added as a normal sibling IIFE right after the theme-toggle one.

Verified via local Playwright (420×800 viewport, logged in as the primary user): collapse
click hides `#titleRowExtras` (`display:none` confirmed) and the progress/tab section, the
clock stays visible and correctly formatted, and a second click fully re-expands the header
— screenshots confirmed the collapsed state reads as the intended single compact line with
just logo/title/clock/chevron, content starts immediately below it. Republished the artifact
(version 36).

## User profile/ticket section + admin panel (added 2026-10-05, `docs/index.html` only)

### Why this is static-site-only, not in the artifact too
The ask was: a profile-fill-in + ticket/message box for every logged-in user except `amir`,
and an admin panel visible only to `amir` showing everyone's profile info, login
count/timing, and submitted messages. This fundamentally depends on the multi-user login
gate (`GATE_USERS`/`CURRENT_USER_ID`/`USER_NAMES`) that only exists in `docs/index.html` —
the live artifact has no login UI of its own and is hardcoded to a single identity
(`ARTIFACT_USER_ID = "amir"`, see the multi-user section above), so there is no "other
users" concept there to build an admin view over. Not ported, and shouldn't be without the
user asking for a real identity system on the artifact side first.

### Privacy decision — read this before touching this feature again
Before building, checked whether `4mirgr/intMed-study-plan` is a private repo (it determines
whether anything stored here is actually access-controlled): confirmed via
`curl https://api.github.com/repos/4mirgr/intMed-study-plan` → `"private": false`. This
repo is **public**. That means profile data (full name, medical-council/student number,
phone number) and ticket messages stored in `state.json` on the `study-state` branch get
the same protection level already accepted for `content-bundle.json` — readable by anyone
who hits the GitHub Contents API unauthenticated, same "casual visitor" trust model, not
real access control. This is a materially different category of data than study progress
(it's other real people's PII, not just the current user's own notes), so this was
explicitly surfaced to the user via `AskUserQuestion` before writing any code, offering: (a)
proceed on the existing public GitHub-backed store, (b) scope the whole feature to the
artifact's private `db` instead (rejected above — doesn't fit the multi-user requirement),
(c) split state storage into a separate private repo. **User chose (a) — proceed on the
existing public `state.json`, explicitly accepting the exposure.** If this is ever revisited
(e.g. someone asks "why can anyone see my phone number"), that's the answer: it was a known,
discussed tradeoff, not an oversight. Don't silently "fix" it into a private store without
the user asking — that's a real infrastructure change (breaks the current single-repo/
single-PAT-scope setup documented in the GitHub-backed-sync section above).

### Data model
Extended the existing `STATE.users.<userId>` bucket shape (`itemState`/`meta`/`highlights`)
with two more per-user fields:
```json
"profile": { "fullName": "...", "idNumber": "...", "phone": "...", "updatedAt": "ISO" },
"loginLog": [ { "at": "ISO timestamp" }, ... ]
```
`loginLog` is capped to the most recent 500 entries (trimmed in `cleanedStateForSave()`,
same trim-before-save pattern as everything else that writes to `state.json`).

Added one new **top-level** field, `tickets` (sibling of `users`, not namespaced per-user —
the whole point is the admin needs to see every user's messages in one list):
```json
"tickets": [ { "id": "...", "userId": "...", "userName": "...", "message": "...",
               "createdAt": "ISO", "read": false }, ... ]
```
Capped to the most recent 1000 entries on save. `migrateStateShape()` now also ensures
`remote.tickets` exists (defaults to `[]`) on both the already-v2 and the legacy-v1 migration
paths, so an old `state.json` written before this feature doesn't crash the admin panel.

### Login tracking — what "logged in" actually means here
`logLoginIfDue()` is called once per `connectGithub()` success (i.e. once per app session
where GitHub sync is active), **not** on every literal credential-entry at the login gate —
since `bp_authed` persists in `localStorage` indefinitely, most visits don't re-enter
credentials at all, so gating on the login form submit would barely produce any usable
"when do they actually use this" signal. A user who reconnects to GitHub within 5 minutes of
their last logged entry doesn't get a duplicate — this dedupe window exists so a user
refreshing the tab a lot doesn't flood their own log. **Real limitation, not a bug**: this
only fires once a user has connected GitHub with a PAT (same precondition every other
persisted feature in this app already has) — a user who's never connected, or who's
mid-session before their first connect, won't show any login history yet. The admin panel
shows "هنوز وارد نشده" for such users rather than a fabricated zero-with-no-context.

### UI
Two new `<section class="callout">` blocks at the very top of the Dashboard tab (before the
existing "ارزیابی وضعیت" callout), toggled by `CURRENT_USER_ID === "amir"` in
`renderUserPanel()`:
- `#userProfileCard` (non-admin): `.profile-grid` (full name / council-or-student number /
  phone inputs) + save button, then a `.ticket-box` (textarea + send) + `#ticketHistoryList`
  showing that user's own previously-sent messages (read receipt shown if the admin marked
  it read).
- `#adminPanelCard` (`amir` only): a small `.admin-tabs` pill-switcher (reuses the
  `.tabbar`/`.tab-btn` visual pattern at a smaller size) between "کاربران" (one
  `.admin-user-card` per non-admin user in `USER_NAMES` — profile fields, login count, last
  login, 5 most recent login times) and "پیام‌ها و تیکت‌ها" (every ticket newest-first, an
  unread-count badge on the tab itself, a "دیده شد" button per unread ticket).

The non-admin user list for the admin panel comes from `Object.keys(USER_NAMES)` filtered to
exclude `"amir"` — **not** `GATE_USERS`, because `GATE_USERS` lives in a different IIFE
closure (the login-gate IIFE, which also now holds the header-collapse-toggle logic per the
section above) than `USER_NAMES`/`myBucket`/`renderUserPanel` (the main app IIFE) and isn't
reachable from there. `USER_NAMES` already has exactly the right data (id → display name)
for this, so no cross-IIFE plumbing was needed — if a future session ever needs the actual
`GATE_USERS` array (e.g. to add a 4th person) from inside the main app IIFE, it isn't
currently exposed there and would need to be either duplicated or lifted to a shared scope.

All user-controlled free text (profile fields, ticket messages) goes through a new
`escapeHtml()` helper before being placed into `innerHTML` anywhere (admin panel, ticket
history) — this app had no HTML-escaping helper before this feature, since nothing
previously rendered free-text user input back as HTML (notes/highlights use `.textContent`
or are rendered via the DOM API, not string-concatenated `innerHTML`). Don't skip this
helper when adding future features that render user-entered text.

### Testing
Verified via an **instrumented scratch copy** (per the established pattern in the multi-user
testing-note section above — `window.__test` exposing `STATE`/`myBucket`/`renderUserPanel`/
`connectGithub`/`CURRENT_USER_ID`/`USER_NAMES`, never added to the real committed file): the
full flow without needing a live PAT round-trip, since `scheduleFlush()`/`doFlush()` already
no-op when `getPat()` is falsy, so UI interactions could be tested purely against in-memory
`STATE` — (1) logged in as `arash`, confirmed the profile card shows and the admin card is
hidden, filled and saved profile fields, confirmed they landed in `myBucket().profile`
correctly shaped; (2) submitted a ticket, confirmed it appended to `STATE.tickets` and
rendered in the sender's own ticket history; (3) captured that session's `STATE` as JSON,
reloaded fresh as `amir`, confirmed the admin card shows and the profile card is hidden,
injected the captured state and re-ran `renderUserPanel()`, confirmed the admin "کاربران" tab
correctly rendered `arash`'s filled-in data alongside `alisalehi`'s untouched placeholders
("—" / "هنوز وارد نشده") without crashing on missing data; (4) switched to the tickets tab,
confirmed the message rendered with the correct sender name and an unread badge, clicked
"دیده شد", confirmed the badge cleared. Screenshots reviewed for layout at each step.

## Follow-up UI changes, 2026-10-05: default tab, hide legacy dashboard, de-GitHub-ify labels

Same day as the profile/admin-panel feature above, three more changes to `docs/index.html`:

1. **Education tab is now the default after login**, not Dashboard — swapped which
   `tab-btn`/`tab-panel` pair carries the `active` class in the static HTML (no JS logic
   changed; the tab-switcher was already purely class-driven).
2. **Old dashboard content hidden, not deleted.** The status-evaluation callout, the
   "removed from the original plan" note, the "here card" (current-phase pointer), and the
   phase checklist (`#phasesRoot`) are now wrapped in `<div id="dashboardLegacyContent"
   style="display:none">`. Per the user's explicit instruction ("بدون اینکه یادت بره یا
   مستقیما حذفش کنی — فقط نمایش پیدا نکنه"), this is a single toggle point: bringing it back
   later is dropping that one `display:none`, not restoring deleted markup. The new
   profile/ticket card and admin panel (previous section) are unaffected and still show.
3. **Removed "GitHub"/"گیت‌هاب" from the short, user-facing labels** (header connection
   pill, connect button, sync-settings modal title, disconnect confirm dialog, footer note,
   one `alert()`) — e.g. the error state now reads exactly "خطا در همگام‌سازی" per the user's
   given example, the connect button reads "اتصال برای ذخیره‌سازی". **Deliberately left
   untouched**: the modal's step-by-step token-creation instructions (the numbered list
   that says to go to `github.com/settings/personal-access-tokens/new`) — those sentences
   inherently need to name GitHub to make sense as instructions, and the user's ask read as
   being about the short status/label wording, not that walkthrough text. Flag this scoping
   choice back to the user if they actually wanted the walkthrough reworded too.

Also added a **connect-reminder box** (`#connectReminderBox`, amber/warning styling built
from the existing `--warn`/`--warn-soft` design tokens, not new colors) shown above the
profile/admin section whenever the connection state is `nopat`/`error`/`auth` (toggled
inside `setConn()`) — prompts the user to connect, with a button that just synthetically
clicks the existing `#ghConnectBtn` to open the same modal, rather than duplicating any
connect logic.

### What was explicitly NOT built, and why — read this before adding a "shared token" UI again

The user asked for this box to also display a **ready-made GitHub PAT as a copy-paste code
block** (with a copy button) so `arash`/`alisalehi` could skip generating their own token,
and pasted a real, live, write-scoped PAT directly in the chat for this purpose
(`github_pat_11BRZAW4...`). **This was not implemented as asked — the token was not put
anywhere in `docs/index.html` or any other committed file.** Reason: `docs/index.html` is
committed to the public `4mirgr/intMed-study-plan` repo and served as plain, unauthenticated
HTML on drgerami-md.ir — anyone who views page source or opens devtools would see the raw
token, and this isn't a theoretical risk, it's the literal mechanism by which the feature
was requested to work ("یک باکس حاوی این کد... که فرد فقط کافیه paste کنه" only works if the
code is sitting in the page for them to see and copy, which means it's sitting there for
*everyone* to see and copy). A leaked write-scoped PAT for this repo lets anyone overwrite
`state.json` on the `study-state` branch — every user's progress, profile data, and tickets.
This was flagged directly to the user rather than silently built or silently skipped.

If a lower-friction connect flow for `arash`/`alisalehi` is wanted later, the options that
don't have this problem: (a) the admin generates one token **per person** (not shared) and
sends each one privately (Telegram/SMS/in person) — same mechanism already built, just with
the admin doing the github.com steps on the colleague's behalf instead of making them learn
GitHub; (b) same idea but admin generates and hands it over however; neither puts a secret
in the public page. **The token pasted into this conversation should be treated as
compromised and revoked/regenerated** — it was typed in plaintext into a chat session,
which is standard reason enough to rotate a credential regardless of where it ends up, even
though it was never committed anywhere by this session.

## Signup (عضویت) flow, removed reset button, and a real data-loss bug fix (2026-10-04/05)

### Reset button removed
The footer "ریست کامل (روی همهٔ دستگاه‌ها)" button and its click handler were deleted
outright, per explicit user request — not hidden, gone, along with the handler that zeroed
out `itemState`/`meta` for every phase item and topic in the current user's bucket.

### Signup (عضویت) flow — a human-relay, not an automatic pipeline
Built because the user asked for a self-serve way for a new person to request an account,
without the admin having to hand-create every GitHub PAT walkthrough in person. **This is
NOT an automatic/instant signup** — it can't be, for the same reason the shared-token request
above was refused: this is a 100%-static site with no backend, so there is no code that can
run with permission to WRITE `state.json` except whoever's browser is holding a real PAT.
Any secret capable of "just writing this one new signup" would, on a public page, be a secret
capable of overwriting everyone's data — there is no way to scope a browser-held credential
to one JSON key. So the flow is a **relay through the admin**, by design:

1. **Public signup form** (`#signupForm`, reached via `#showSignupLink` under the login
   form, same `.login-card` visual treatment): نام کاربری، رمز، نام و نام خانوادگی (kept as
   a field **separate from** نام کاربری per the user's explicit correction), آخرین مدرک
   تحصیلی، کد نظام/دانشجویی، شماره موبایل، ایمیل. Submitting does **not** write anywhere —
   it only computes `hash = fnv1aHex(username + ":" + password)` client-side (same hash the
   login gate itself checks against) and shows a green success box (`#signupSuccessBox`,
   new `--success`/`--success-soft` design tokens — see below) with the exact wording asked
   for ("بعد از تایید مدیر توکن در اختیارتان قرار خواهد گرفت...").
2. **Relay to the admin**: the success box offers "ارسال به مدیر (واتساپ)" (a `wa.me` deep
   link pre-filled with all the submitted fields + the computed hash, opened to the admin's
   own number) and "کپی اطلاعات" (clipboard copy of the same text) — whichever the signer's
   device supports.
3. **Admin-side intake** (`#adminPanelCard`, `amir`-only): a "+ افزودن درخواست ثبت‌نام"
   toggle (`#adminAddSignupToggle`) reveals a mini-form (`#adminSignupForm`) with the same 7
   fields; the admin re-types what came in over WhatsApp/copy-paste. Submitting pushes a
   `{id, username, hash, fullName, degree, idNumber, mobile, email, status:"pending",
   createdAt}` record into `STATE.signups` — this write is secured by the **admin's own**
   already-connected PAT, same as every other write in this app.
4. **Pending requests shown first in the admin panel**, in their own amber/warning-styled
   box (`#adminSignupsList`, same visual language as `.connect-reminder`), per the user's
   explicit ask — above the existing کاربران/تیکت‌ها tabs, not buried in a tab.
5. **Approve/reject** (`data-approve-signup`/`data-reject-signup` buttons): approving calls
   `deriveUserId(username)` (lowercases, strips non-alphanumerics, disambiguates against
   every known static + already-approved id with a numeric suffix) to mint a `userId`,
   creates `STATE.users[userId]` via `emptyBucket()`, pre-fills its `profile` from the
   signup's fullName/idNumber/mobile, and flips the signup's `status` to `"approved"`.
6. **Dynamic login check**: the login-gate IIFE's submit handler still checks the static
   `GATE_USERS` array first (fast path, works offline), and only if that misses, calls a new
   `fetchPublicState()` (a plain **unauthenticated** `GET` of `state.json` — works because
   the repo is public, no PAT needed to read) and checks `remote.signups` for a `hash` match
   with `status === "approved"`, logging in as that signup's `userId` if found.

**Why this can't be made more automatic without the user asking for new infrastructure**:
investigated Google Forms/Sheets as a possible anonymous-intake backend (so a new signup
could write directly into a sheet without the admin relaying anything by hand) — this
account's available tools only support whole-document Drive operations
(`mcp__Google_Drive__create_file`/`update_file`, etc.), there's no Forms-creation API and no
granular Sheets-values-append API reachable from here, so a live anonymous-submission
pipeline into a spreadsheet isn't buildable with current tooling either. A static roster
sheet **was** created (see below) but it is not wired to receive live submissions.

### A real production bug this surfaced and fixed: `connectGithub()` discarding local writes
While verifying this flow, the user reported a concrete symptom: a ticket sent from `arash`
(tried once disconnected, once after connecting with a token) never showed up in the admin
panel. **Checked the actual `state.json` on the `study-state` branch directly** (plain
unauthenticated `GET`, no tooling needed) — `tickets` was genuinely `[]` there, so this
wasn't "admin just needs to refresh," the write itself was never landing.

Root cause, in `connectGithub()`: it did a blind `STATE = migrateStateShape(remote)`, which
**unconditionally discards whatever was in the in-memory `STATE` before the fetch resolved**.
Combined with the fact that `scheduleFlush()`/`doFlush()` are no-ops whenever `getPat()` is
falsy (by design — nothing to write to without a token), the natural, common sequence that
loses data every time is: a user interacts with the ticket box / profile fields / a
highlight / a checkbox **before ever connecting a token** (very likely — connecting is a
deliberate extra step, not a precondition the UI blocks on), those edits sit only in local
`STATE` with nothing flushing them, and then the moment that same tab connects (or
reconnects — e.g. opens the sync-settings modal and re-saves the same token to check the
connection), `connectGithub()` fetches the remote and throws the local edits away before
they ever reach GitHub. This is not limited to tickets — the exact same hole existed for
`itemState` (checkboxes/status pills), `highlights`, and `profile`, for anyone's very first
connect of a session.

**Fix**: `connectGithub()` now snapshots the local `STATE` before fetching, then
`mergeLocalIntoRemote(localSnapshot, migrated)` folds it into the freshly-fetched remote
*before* replacing `STATE`:
- `tickets`/`signups`: append any local-only entry whose `id` isn't already in the remote
  array.
- `itemState`: per-key overwrite from local onto remote (every key here only exists because
  the user actually touched that item — `applyLoadedState()`/`writeItemState()` never
  pre-seed defaults — so "local wins per key" can't clobber real remote data with
  untouched-item defaults).
- `highlights`: per-topic, append any local highlight `id` not already in the remote array
  for that topic.
- `profile`: local wins only if it has an `updatedAt` at least as new as the remote's.
- `loginLog`: append any local entry whose timestamp isn't already present.

If the merge actually added anything, `connectGithub()` schedules a flush (`scheduleFlush(200)`)
right after, so the recovered data is written back immediately rather than waiting on some
unrelated future edit to trigger the next flush (which could otherwise be lost again to a
second reconnect first). Verified with two Playwright-driven unit-style tests against an
instrumented scratch copy (mocking the GitHub GET/PUT via `page.route`): (1) a ticket added
to local `STATE` with no PAT set, then connecting — ticket survives in `STATE.tickets` after
`connectGithub()` *and* gets included in the resulting PUT body; (2) a no-op case (nothing
local to merge, remote already has the real data) produces **zero** PUT calls — confirms the
fix doesn't turn every normal connect into a spurious extra write.

**This was a real correctness bug independent of the signup-flow feature** (it predates this
session's work — the function already existed), just surfaced by testing the ticket feature.
If anything else in this app writes to `STATE` before guaranteeing a connected token first
(future features should keep this in mind), this merge is what keeps those edits from being
silently dropped on the next connect.

### Sync-settings modal reordered
The PAT input + a new amber "توکن را وارد کن" label (`--warn` styling, matching the existing
warning-box color) now sit at the very top of `#ghModal`, right under the heading — moved
ahead of the step-by-step GitHub-token-creation instructions, which still exist but are now
wrapped in `#ghAdminInstructions` and only shown when `CURRENT_USER_ID === "amir"` (everyone
else just sees the token field + the short "get your token from the admin" line, not a
walkthrough for creating their own GitHub PAT, since non-admin users are expected to receive
a token via the admin's connect flow, not mint their own).

### Connect-reminder box wording
Updated to the user's exact requested text: "بدون اتصال توکن پروفایل، پیام‌ها، هایلایت و
یادداشت‌ها ذخیره نمی‌شوند. توکن اتصال را از مدیریت سایت دریافت کنید." — same amber box,
same trigger logic (`nopat`/`error`/`auth` conn states), just the copy changed.

### New design tokens: `--success`/`--success-soft`
Added to all three `:root` blocks (light, `prefers-color-scheme:dark` media query, and
`:root[data-theme="dark"]`) because the signup-success box needed a true green with a neon
checkmark per the user's spec, and the existing `--accent` teal isn't green enough to read
as a distinct "success" color from the app's normal accent. Light: `#1c8a5a`/`#e1f5ec`.
Dark: `#4ade80`/`rgba(74,222,128,.16)`. Follows the same `color-mix(in srgb, var(--success)
N%, transparent)` halo pattern already used for `.cat-dot`/`.logo-badge` elsewhere in this
file.

### Google Sheet created — static roster only, not a live backend
Per the user's mid-turn ask ("در گوگل درایو یک فایل گوگل شیت بساز و اطلاعات این کاربران را
آنجا ثبت کن"), created **"IntMed - کاربران و ثبت‌نام‌ها"** as a native Google Sheet via
`mcp__Google_Drive__create_file` (CSV content, `application/vnd.google-apps.spreadsheet`
mimeType) — `fileId: 1D0PuHnOUEeUrhFZw2BT4QVmaburvwQDOhsHzgIlPF7c`,
`https://docs.google.com/spreadsheets/d/1D0PuHnOUEeUrhFZw2BT4QVmaburvwQDOhsHzgIlPF7c/edit`.
Seeded with the 3 known static users (drgerami/arash/alisalehi) and their non-sensitive
fields only (no passwords/hashes). **This sheet is a one-time snapshot, not wired to receive
live signups** — per the Google Forms/Sheets tooling-limitation note above, there's no
anonymous-write path available to append new signups into it automatically. If live rows in
this sheet are wanted, the only path with current tooling is the admin manually re-entering
each approved signup here too (or asking in a future session to revisit once a Sheets
values-append tool becomes available).

### Artifact (claude.ai "IntMed") — NOT touched by this batch
Everything in this section (reset-button removal, signup flow, admin intake, dynamic login,
modal reorder, connect-reminder wording, the `connectGithub()` merge fix) is
`docs/index.html`-only. The signup/profile/admin-panel feature already depends on the
multi-user login gate the artifact doesn't have (see the "User profile/ticket section" entry
above), so none of this was ported. The `connectGithub()` merge-bug fix specifically: the
artifact's own equivalent sync function (hardcoded to `ARTIFACT_USER_ID = "amir"`, no
tickets/profile/signups concept) was **not checked or patched** in this pass — if the same
blind-overwrite pattern exists there for highlights, it would need its own look.

## Green topic titles, expanded profile fields, ticket replies, admin accordion (2026-10-04)

Four changes to `docs/index.html`, `docs/index.html`-only (same reason as the signup/profile
batch above — all depend on the multi-user login gate the artifact doesn't have).

### 1. Topic title turns green while its detail is open
`.topic-item.open .topic-list-title` already existed (set when the topic row's detail panel
is expanded, cleared when closed — `item.classList.toggle("open", willOpen)` in the topic-
list click handler) but colored the title with `var(--cat-color,var(--accent))` (the per-
category accent, which varies by category and isn't green). Changed the one rule to
`color:var(--success)` — no JS change needed, the open/close toggle was already correct, this
was purely which CSS variable the open state painted.

### 2. Non-admin profile card now mirrors the full signup form
`#userProfileCard`'s `.profile-grid` went from 3 fields (fullName/idNumber/phone) to 5,
matching every signup-form field that isn't a login credential (username/password stay
login-only, not profile fields): added **آخرین مدرک تحصیلی** (`#profileDegree`) and
**ایمیل** (`#profileEmail`). `myBucket().profile` shape is now `{fullName, degree, idNumber,
phone, email, updatedAt}`. Updated every place that reads/writes this shape: the save
handler, the `renderUserPanel()` prefill, and the admin approve-signup handler (now also
copies `s.degree`/`s.email` into the new user's profile, not just fullName/idNumber/phone).
Caption above the card changed to the user's exact requested wording: "این اطلاعات فقط برای
مدیر سایت قابل مشاهده می‌باشد." (was: "...برای دکتر گرامی (مدیر)...").

A pre-approved static user (`arash`/`alisalehi`) who never went through the signup form just
sees these 5 fields empty and fills them in themselves from the profile card — same UI,
whether the data arrived via signup-approval or manual entry.

### 3. Admin reply to tickets — shown in green under the user's own message
`renderAdminTickets()` now renders a `.admin-ticket-reply-box` (textarea + "ارسال پاسخ" button)
under every ticket, pre-filled with any existing reply (so re-opening it is an edit, not a
blank box). Sending sets `t.reply`/`t.replyAt`/`t.read=true` on the ticket object directly —
no schema change needed since `cleanedStateForSave()` already round-trips whole ticket
objects, not a field whitelist. `renderTicketHistory()` (the user's own view) now renders
`.ticket-history-reply` under that ticket's own entry when `t.reply` is set — a
`--success`-colored box with a `box-shadow` glow (same `color-mix(in srgb, var(--success)
N%, transparent)` halo pattern used elsewhere in this file) for the "نئونی" look asked for.

### 4. Admin "کاربران" (users) panel: accordion + search, fields matching the signup form
Was a flat list of always-expanded cards showing only 3 fields. Rewrote `renderAdminUsers()`
as a search-filtered accordion: a `#adminUserSearch` input above the list (matches against
display name, userId, idNumber, phone, email, degree — case-insensitive, Persian-digit-
normalized via the existing `normalizeDigits()`), each user is a collapsed `.admin-user-card`
by default (one-line header: name + login count + chevron) that expands on click to show the
full detail — now the same 5 signup-form fields (username, fullName, degree, idNumber,
phone, email) instead of the old 3-field subset, plus the existing login-count/last-login/
recent-logins rows. Open/closed state is tracked in a module-level `adminUsersOpenIds` map
so re-rendering on every search keystroke doesn't collapse a card the admin just opened.

### Google Sheet live-sync — needs a one-time manual step from the user, not buildable blind
The user asked that a profile save also update the "IntMed - کاربران و ثبت‌نام‌ها" Google
Sheet (see the earlier Google-Sheet entry above — it was a one-time static snapshot before
this). **This cannot be wired up by a Claude Code session alone**, for the same root reason
noted earlier: the available Drive/Sheets tools only support whole-file `create`, not a
per-cell/per-row values write, and `docs/index.html` is a static page with no backend of its
own to call the real Google Sheets API (which needs OAuth, not a fit for a public static
page either — same class of problem as embedding a GitHub PAT in page source).

The buildable fix: a **Google Apps Script Web App**, which runs on Google's own
infrastructure and can be deployed with "Anyone" access without exposing any credential that
can do more than append/update one row. `docs/index.html` now has a
`syncProfileToSheet(userId, profile)` function (called from the profile-save handler,
fire-and-forget, never blocking the existing GitHub-backed save) that POSTs the profile JSON
to `GOOGLE_SHEET_WEBHOOK_URL` — **currently empty, so it no-ops silently** until that constant
is filled in with a real deployed Web App URL. The exact script (reads `e.postData.contents`,
finds the row by username in column A, updates columns C–G, or appends a new row if the
username isn't in the sheet yet) is saved for the user at
`scripts/sheet_sync_apps_script.gs` in this repo. **One-time setup the user has to do** (no
tool in this session can do it for them — Apps Script deployment has no API surface reachable
here): open the sheet → Extensions → Apps Script → paste the script → Deploy → New deployment
→ type "Web app", execute as "Me", access "Anyone" → copy the resulting `/exec` URL → give it
to a future session (or ask directly) to drop into `GOOGLE_SHEET_WEBHOOK_URL`. Until that
happens, profile saves keep working exactly as before (GitHub `state.json` + admin panel),
just without the Sheet mirror.

## Missing viewport meta tag — every mobile visitor was getting the desktop layout (2026-10-04)

`docs/index.html` is a bare HTML fragment with no `<head>`/`<body>` of its own (see the login-
gate section near the top of this file) — and it turns out it never had a
`<meta name="viewport">` tag either, in the entire history of this project. Without one,
mobile browsers lay the page out in a virtual ~980px desktop-width viewport and scale the
whole thing down to fit the screen — exactly the "looks like the desktop version, everything
tiny" symptom the user reported. Fixed with one line, right after the existing charset meta:
`<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1,
viewport-fit=cover">`. Verified via Playwright mobile emulation (390×844, device-scale-factor
3, `is_mobile`/`has_touch`): `document.documentElement.clientWidth` went from the implicit
~980 to the real `390`, with no horizontal overflow (`body.scrollWidth` also 390).

Not an issue on the claude.ai artifact — that page runs inside claude.ai's own page shell,
which supplies its own `<head>`/viewport already (see the "tiny inline `<style>` in `<head>`"
note in the UI-design-system section above — same shell). This fix is `docs/index.html`-only.

## Fallout from the viewport fix: reclaiming mobile text width, and a ticket-reply feedback gap (2026-10-04)

### Mobile padding was never tuned against a real phone width
Immediate user follow-up after the viewport fix above: "نسخه موبایل هم خیلی جمع و جور شده...
زود خط تمام میشه" (lines wrap too soon, feels cramped). Correct read of this: the page's
padding values were chosen while the page had never actually rendered at a true ~390px
width (the missing-viewport bug predates this entire project), so nobody had tuned them
against that width — once the viewport fix let the page render correctly, the padding
stacked at every nesting level on the reading path (`.app` → `.topic-cat`'s `.cat-inner` →
`.learn-panel`) added up to ~113px of pure gutter on a 390px screen, leaving only ~277px
(71%) for actual text. Added a `@media (max-width:480px)` block tightening `.app`,
`.cat-inner`, `.learn-panel`, and `section.callout` padding specifically — reclaims ~45px,
content width goes to ~304px (78%). Verified via Playwright at a real 390×844 mobile
viewport (`is_mobile`/`has_touch`/`device_scale_factor:3`) + a full-page screenshot reviewed
for layout before committing.

### Admin ticket-reply button: real tap worked, but gave no feedback either way
Same session, the user reported "روی دکمه ارسال پاسخ که میزنم اتفاقی نمی‌افتد" (nothing
happens when I tap send). Verified with a genuine Playwright **touch tap** (`element.tap()`,
not a scripted `.click()` — the two can diverge on real interaction quirks, per the
pre-existing Playwright-actionability-quirk precedent elsewhere in this file) that the tap
itself, the event listener, and the state update all worked correctly end to end. So the
reported symptom wasn't a broken handler — it was a **missing-feedback** bug with two real
causes, both now fixed in `renderAdminTickets()`'s reply-send handler:
1. Clicking send with an **empty textarea** silently did nothing (`if(!reply) return;`, no
   message) — now shows "اول پاسخ رو بنویس." next to the button.
2. On a **successful** send, the only visible effect used to be an instant full re-render of
   the reply box back to looking *exactly the same* (same textarea, now just pre-filled with
   the text the admin had just typed) — indistinguishable from nothing having happened at a
   glance. Now shows "ارسال شد ✓" immediately, and the re-render that would wipe that note is
   delayed ~900ms (`setTimeout(renderAdminTickets, 900)`) so the confirmation is actually
   seen before the box refreshes.

Verified both paths via Playwright: empty-send shows the warning note and doesn't crash;
a real send shows "ارسال شد ✓" within 150ms (well before the 900ms re-render) and the ticket
object correctly ends up with `reply`/`replyAt`/`read:true` after the re-render completes.

## Two gray category colors, open-title color reverted, admin→user messaging, locked profile fields (2026-10-04)

### Two near-identical gray category colors
`general` (جنرال) and `crit` (مراقبت ویژه و اورژانس داخلی) had `#5b6472`/`#586170` —
essentially the same muted slate gray, which is what the user was seeing as "دو تا از
عناوین درسی طوسی". Changed to `#b8962e` (gold/mustard — the open hue gap in the existing
palette, nothing else here reads as yellow) and `#17a2b8` (a brighter, more saturated cyan
than `nephro`'s darker teal `#0f9285`). Checked against all 10 other category colors already
in use (`cardio` red, `pulm` blue, `nephro` teal, `gi` brown, `endo` purple, `heme` magenta,
`rheum` orange, `id` green, `neuro` indigo, `poison` dark brown) for hue separation before
picking these two. Ported identically to the live artifact's own `TOPICS` array (confirmed
via diff that only those two color values changed, nothing else in the 2200+-line file) and
republished (version 37).

### Open-topic-title color reverted from green back to the category's own color
The "turns green while open" change from earlier the same day was explicitly reversed by the
user a few messages later: "رنگ عنوان سبز میشه همونطور که خواستم اما الان میخوام بجای سبز...
رنگ همون مبحث مادر باشه" — they'd asked for green, saw it live, and changed their mind in
favor of each topic inheriting its own category's accent color instead (so `general` topics
open in gold, `cardio` topics open in red, etc.) rather than one flat color for every
category. `.topic-item.open .topic-list-title` is back to `color:var(--cat-color,var(--accent))`
— exactly what it was before that day's first change. The `--success` token itself is
untouched (still used by the signup-success box and the ticket-reply green boxes elsewhere).

### Admin can now message a user directly, and sees the conversation recorded
Previously the only way a message/reply existed was user-initiated (a ticket) with an
optional admin reply nested under it — there was no way for the admin to start a
conversation, and (the bug the user actually reported) sending a reply gave the admin no
persuasive confirmation it had gone anywhere. Added, per the user's explicit ask:
- A "ارسال پیام" compose box (textarea + button) inside each user's accordion card in the
  admin "کاربران" panel. Sending pushes a new `STATE.tickets` entry shaped exactly like a
  normal ticket but with `fromAdmin: true` and no `message`-from-user — `message` here *is*
  the admin's own text, `read` defaults `true` (nothing to mark read), no `reply`/`replyAt`
  fields are used for this direction.
- `renderAdminTickets()` now renders `fromAdmin` entries as a distinct, read-only "شما → 
  <name>" card (new `.admin-ticket-item.sent` style — `--primary`-colored left border instead
  of `--accent`/`--danger`) in the same combined, newest-first list as regular tickets — this
  is literally the "به من هم نشان دهد" ask: opening "پیام‌ها و تیکت‌ها" now shows every
  conversation with every user, not just the ones users themselves initiated.
- `renderTicketHistory()` (the user's own dashboard) renders a `fromAdmin` entry as a
  standalone message FROM the admin (reusing the existing green `.ticket-history-reply` box,
  labeled "پیام از مدیر" instead of "پاسخ مدیر") rather than as "your own message" with
  nothing above it.

### Non-admin profile fields lock once filled; admin edits bypass the lock
Per the user's explicit ask: "فقط فیلدهایی که پر نشده قابلیت پر کردن داشته باشه... اطلاعاتی
که موقع ثبت‌نام ثبت شده... فقط به‌صورت متن (غیرقابل تغییر) نمایش داده بشه." `#userProfileCard`
no longer has 5 static `<input>`s — `renderMyProfileFields()` renders each of the 5
`PROFILE_FIELDS` (shared array, also used by the admin edit box below) as a locked
`.profile-field-value` (plain text + a 🔒 marker) if `profile[key]` already has a value, or as
an editable `<input data-profile-field>` if it's still empty. The save handler
(`profileSaveBtn`) only ever reads from inputs that still exist in the DOM — a locked field
has no input to read from, so there's no way for the user to overwrite it even by forging a
request; the lock is enforced by what gets rendered, not just visually suggested.

The admin's per-user accordion card gained a matching `.admin-user-edit-box`: the same 5
fields, **always** editable regardless of lock state (the user's own explicit carve-out:
"اگر من به‌عنوان مدیر هم تغییری در اطلاعات یک کاربر ایجاد کردم..."), pre-filled with current
values, with its own "ذخیره تغییرات پروفایل" button that writes directly into
`STATE.users[id].profile` and calls `syncProfileToSheet(id, profile)` the same way the user's
own save does.

### Google Sheet as "canonical source" — pushed back on the literal ask, here's why
The user's exact wording: "تمامی اطلاعات کاربران از هرجا و هرمقداری که خواست استخراج و
بازخوانی بشه باید الگوش گوگل شیت باشه" (the Sheet should be the template everything gets
read back from). **Did not build the app itself reading from the Sheet at runtime** — that
would mean every profile render depends on a live fetch to Google's infrastructure (slower,
adds a new failure mode, and the Apps Script Web App fetch has none of the reliability
guarantees `state.json`'s GitHub Contents API already has for this app). `state.json` on the
`study-state` branch already **is** the complete, authoritative, fast-reading live data store
that drives every render in this app (locked/unlocked fields, admin accordion contents,
ticket threads — all of it). Reading the same data a second way from the Sheet on top of that
would be pure added latency and fragility for zero functional gain, since GitHub already has
the current value the instant it's saved.

What **was** built to honor the spirit of the ask: **every** profile write — the user's own
save, the admin's edit-box save, and the admin-approve-signup prefill — now calls
`syncProfileToSheet(userId, profile)` (same function from the earlier Google-Sheet section
above), so the Sheet genuinely reflects the latest value for every field, from every source,
not just the user's own saves. The Sheet's role is a **human-readable mirror for browsing/
exporting in Google Sheets' own UI**, not a second live data path the app itself depends on —
this is the one piece of the literal request not implemented as asked, flagged directly
rather than silently built around. (Also still blocked on the same one-time Apps Script
deployment noted earlier — `GOOGLE_SHEET_WEBHOOK_URL` is still empty, so none of these three
write paths actually reach the Sheet yet until that's done.)

Verified the full flow via Playwright: arash fills 2 of 5 fields (both lock, remaining 3 stay
editable) → admin opens arash's card, sees all 5 as editable inputs pre-filled with current
values (including the 2 arash already locked), corrects one and fills a previously-empty one,
saves → admin sends a direct message → admin's own ticket list shows the sent record →
arash's own dashboard shows the admin's message as a green "پیام از مدیر" box and the
corrected/filled fields now locked with the admin's values.

## Highlighting in MCQ/flashcard fronts, intro-text wording, admin password changes, forgot-login (2026-10-04)

### Highlighting extended to flashcard fronts and MCQ stem/explanation
Scope before this: lesson prose, flashcard **backs**, and table cells (explicitly NOT
MCQ/KF-PMP/images, per the original 2026-10-01 scope decision). The user asked to extend it
to "تست‌ها و فلش‌کارت‌ها" — read as: flashcard **fronts** (backs were already covered) and
MCQ. The existing highlight machinery is fully generic — any element that gets
`dataset.hlRawText`/`dataset.hlLoc`/`dataset.hlTopic` set and a call to
`applyHighlightsToContainer()` becomes annotatable automatically, since the selection
listener just walks up to the nearest `[data-hl-loc]` ancestor — so this was wiring, not new
infrastructure:
- Flashcard front: new `loc` format `fc-front:<id>` (distinct from the existing `fc:<id>`
  for the back, so old back-highlights keep their anchoring unchanged).
- MCQ: `mcq:<id>:stem` and `mcq:<id>:explain`. **Deliberately did not wire the options**
  (the `.mcq-opt` buttons) — they're interactive click targets for picking an answer, and
  making running text inside a button selectable is an unusual interaction that would also
  complicate the existing correct/incorrect-styling click handler; stem + explanation cover
  the actual prose worth highlighting. KF&PMP was not touched either — the user said "تست‌ها"
  which in this app's own vocabulary is the MCQ tab (آزمون ۴ گزینه‌ای), not KF&PMP.
- The هایلایت‌های من list's source label (`لیگsc` → "درسنامه"/"فلش‌کارت"/"جدول") extended
  with a "تست" branch for the two new `mcq:` prefixes.
- Verified via Playwright: rendered a real topic's flashcard/MCQ panels directly (bypassing
  UI navigation, via an exposed `renderLearnPanel`), confirmed the new `data-hl-loc` values
  on the front/stem/explain elements, then actually committed a highlight and confirmed a
  `<mark>` rendered on the flashcard front after a re-render.

### Education-tab intro text — last sentence changed, flashcard/MCQ wording updated
Exact wording swap per request: "...در گفتگو بگو" → "...در پنل کاربری خود نظرتان را ارسال
بفرمایید." Also updated the sentence listing what's highlightable ("پشت فلش‌کارت‌ها و
سلول‌های جدول" → "فلش‌کارت‌ها، تست‌ها و سلول‌های جدول") to match the scope change above —
would've been actively wrong to leave the old wording once fronts/MCQ became highlightable
too.

### Admin can change (not view) a user's password
The user's literal ask had two halves: "پسوردی که انتخاب کرده را نیز نشان بده" (show the
password they chose) **and** "قابلیت تغییر پسورد... را نیز در اختیار مدیر... قرار بده" (give
the admin the ability to change it). **Only built the second half.** The first half was
declined on the same grounds as the earlier refused shared-GitHub-token request: this repo
is public, `state.json` is readable unauthenticated by anyone, and the app's own comment
already states the invariant this would break — "plaintext password never stored anywhere."
Storing a plaintext password anywhere reachable from a public repo is a materially worse
exposure than the existing FNV-1a hash (which at least requires effort to reverse, however
weak), and for actual people's actual login credentials rather than contact-info PII, that
tradeoff isn't the same category as the profile-PII one the user already explicitly accepted
— so this wasn't silently built, and wasn't silently dropped either.

What **was** built, fully respecting that invariant (never reads or stores the old plaintext,
only ever writes a new hash):
- `STATE.users[id].passwordHash` — a new, live, per-user field. Set at signup-approval time
  (copied from the signup's own `hash`), and from then on the **authoritative** credential
  for that account, overridable any time via the admin's new "تنظیم رمز عبور جدید" box in
  that user's accordion card (one text input + a button — admin types the new password,
  which gets hashed with `fnv1aHex(originalSignupUsername + ":" + newPassword)` and written
  directly, never touching or reading whatever hash was there before).
- The dynamic login-check (the one that fetches `state.json` for a non-GATE_USERS login
  attempt) now checks `users[uid].passwordHash` **first**, falling back to the legacy
  `signups[].hash` match only if no bucket has a `passwordHash` yet (covers, in theory, an
  approved signup from before this field existed — though realistically none exist in
  production yet, since the Sheet webhook this whole signup pipeline still waits on has
  never been deployed).
- **Bug caught by testing, fixed before shipping**: the first version of the password-change
  handler only updated `passwordHash` and left the original signup record's `hash` field
  stale — since the login check's fallback path still matched that stale hash, the OLD
  password kept working indefinitely alongside the new one. Fixed by also updating the
  matching `STATE.signups[].hash` record in the same click handler. Caught via an actual
  Playwright run (change password → try logging in with the old one → it should fail and
  didn't on the first pass) rather than by inspection — reinforces why every write path that
  touches auth gets an actual negative-case test, not just a positive one.
- **Static accounts (amir/arash/alisalehi) are explicitly excluded from this UI** — their
  password hashes are hardcoded in `GATE_USERS` in this file's own source, not in `STATE`, so
  nothing in the running app can change them. Their accordion card shows an informational
  note ("رمز این حساب ایستا و داخل کد سایت است — تغییرش یک ویرایش کد لازم دارد، در گفتگو با
  کلود بخواه") instead of a form. If arash/alisalehi's passwords need changing, that's still
  a code edit + redeploy via a Claude Code session, same as always.

### "فراموشی اطلاعات ورود؟" link — same human-relay pattern as signup, not an automated reset
A real automated password-reset flow (reset email/SMS link) isn't buildable here for the
exact same reason already established repeatedly in this file: no backend, can't send email/
SMS from a static page. Added a `#forgotForm` panel (reached via a new link next to عضویت
under the login form) that collects just a username + mobile number and relays it to the
admin over WhatsApp (same `wa.me` deep-link pattern as the signup success box, same admin
number constant) — the admin verifies it's really that person and sets a new password via
the admin panel's new "تنظیم رمز عبور جدید" action above. No new write path, no new data
model — purely a second doorway into the capability that already existed.

Verified the whole chain via Playwright: forgot-link toggles the panel correctly and builds
the right WhatsApp URL; separately, created+approved a fresh signup, set a password for it,
confirmed the OLD password now fails to log in and the NEW one succeeds; confirmed the
static-account note renders instead of a form for `arash`.

## MCQ stems now numbered at render time (2026-10-04)

The user asked that every topic's 4-option questions be numbered "in their own text." Rather
than hand-editing the `stem` string in every topic's content file (50+ files, including ones
not yet built), added the number at **render time**: `renderLearnPanel()`'s `type==="mcq"`
branch now prepends `"سوال " + faDigits(qIdx+1) + ": "` to the stem before it's set as the
highlightable raw text (`dataset.hlRawText`) — so it's literally part of the displayed/
selectable text, not a separate styled badge, matching what was asked. This is safe for
existing stored highlights: `buildHighlightedFragment()` locates a highlight's `quote` via a
plain substring search (`nthIndexOf`) within whatever the current full text is, so a prefix
added before the original stem doesn't shift or break any previously-anchored highlight.
Verified via Playwright across a real topic's full MCQ set (numbers came out sequential and
correct). Ported the same one-line change to the live artifact (version 38) — note while
doing so: the artifact's MCQ renderer still doesn't have the highlight-wiring
`docs/index.html`'s does (added in the "Highlighting in MCQ/flashcard fronts..." section
above) — a pre-existing gap, not touched by this change, flagged here so it doesn't get
assumed-fixed later.

## `pulm-copd` built from Harrison's Chapter 303 (2026-10-04)

Built from the user-uploaded PDF (Harrison's 22nd ed., Ch. 303) plus 6 image attachments the
user sent alongside it, asking the images section be completed too. **The 6 images are
McGraw Hill's own copyrighted figures** (each carries an explicit "Copyright © McGraw Hill.
All rights reserved." line) — per standing rule 6, none were embedded. Flagged this to the
user up front, before reading the PDF, rather than silently building around it. Handled each
figure by what it actually was:
- **Figure 303-1** (CT patterns of emphysema) and **303-2** (pathobiology pathways diagram):
  genuinely structured/categorical content → rebuilt as markdown tables (emphysema-type
  comparison; effector-cell/pathway/key-molecule/result table), titled to make clear they're
  a textual reconstruction, not the original artwork.
- **Figure 303-5** (GOLD ABE assessment tool) and **303-6** (initial/follow-up pharmacotherapy
  algorithm): these are literally grading tables and decision rules already stated in the
  chapter's own prose (the eosinophil-threshold rules for ICS, the GOLD grade/exacerbation-
  history → group logic) → rebuilt as markdown tables matching that prose exactly, not a
  node-by-node flowchart transcription (more useful and more verifiably accurate to the
  source text than trying to reproduce box-and-arrow layout in text).
- **Figure 303-3** (FEV1-by-pack-years histogram) and **303-4** (natural-history tracking
  curves): a population distribution plot and line-graph curves — not tabulatable data, so
  described narratively in the "ریسک‌فاکتورها: سیگار..." and "سیر طبیعی بیماری" lesson
  sections instead (including the specific finding from 303-4 that most patients with fixed
  airflow obstruction follow curve C — reduced growth, normal subsequent decline rate — not
  the classically-assumed curve D accelerated-decline pattern).
- `images: []` stays empty — there's no non-copyrighted image to put there instead; this is
  the same images.sourceUrl constraint already in the schema ("never a redistributable copy
  of copyrighted material").

Content: 83 flashcards, 15 MCQ, 3 KF/PMP cases (acute exacerbation with respiratory failure,
early-onset emphysema → α1-antitrypsin deficiency workup, GOLD ABE-driven drug escalation),
6 tables, 14 lesson sections. Condensed per rule 4 (English-sourced chapter) while building,
not as a separate pass. Validated: schema-valid (`jsonschema`), 0 جگر occurrences, no
duplicate ids, no rule-3 grammar breaks found in a scripted Latin/Persian-adjacency scan
(remaining matches were all expected — Persian plural/genitive suffixes directly attached to
a Latin abbreviation, e.g. "PiZها", "Z-scoreهای", which is standard Persian typography, not a
grammar break). `pulm-copd` already existed in `TOPICS` in both `docs/index.html` and the
artifact (added in an earlier, unlogged step this session) — no taxonomy edit needed. Synced
to the artifact db as a new doc (version 1, ~97 KiB). Bundle regenerated to 51 topics.

## `pulm-sleep` built from Harrison's Chapter 308 (2026-10-04)

Same day, same pattern: built from the user-uploaded PDF (Harrison's 22nd ed., Ch. 308 —
Sleep Apnea) plus 2 image attachments, again asking the images section be completed. Both
images (a flow-limitation waveform plot, and a 4-panel polysomnography tracing figure) carry
the same McGraw Hill copyright line as the COPD chapter's figures — same rule 6 call, flagged
up front again, none embedded. A third figure referenced in the chapter's own text (308-1,
pharyngeal-collapse anatomy) is also McGraw Hill's artwork, not embedded either. Handling:
- **Tables 308-1** (respiratory event definitions: apnea/hypopnea/RERA/flow-limited breath)
  and **308-2** (AHI/RDI definitions + OSAHS severity scale) and **308-3** (CPAP side effects
  and their management): all three are plain definitional/factual data tables in the source
  (not artwork) — reproduced verbatim as markdown tables.
- **Figure 308-1** (pharyngeal collapse sites: palate, tongue base, lateral walls, epiglottis)
  and **Figure 308-3** (normal vs. flow-limited inspiratory waveform shape): anatomical
  illustration and a waveform plot respectively, neither tabulatable → described in the
  "پاتوفیزیولوژی فروپاشی راه هوایی در OSA" and the PSG lesson sections' prose instead.
- **Figure 308-2** (the 4-panel PSG signal tracings: obstructive apnea, central apnea,
  hypopnea, RERA): raw physiological signal tracings — not tabulatable or usefully
  describable beyond what Table 308-1's own definitions already state, so no separate
  prose reconstruction was attempted beyond those definitions (would have been redundant
  restatement, not new teaching content).
- `images: []` stays empty, same reasoning as `pulm-copd`.

Content: 55 flashcards, 12 MCQ, 2 KF/PMP cases (OSA diagnosis/severity/CPAP-troubleshooting
in an obese patient with resistant hypertension; CSA/Cheyne-Stokes in heart failure with the
ASV-contraindication-by-ejection-fraction teaching point), 3 tables, 10 lesson sections.
Condensed per rule 4 while building. Validated: schema-valid, 0 جگر occurrences, no duplicate
ids, mcq correctIndex bounds checked programmatically. `pulm-sleep` already existed in
`TOPICS` in both files — no taxonomy edit needed. Synced to the artifact db as a new doc
(version 1, ~90 KiB). Bundle regenerated to 52 topics.

## `nephro-aki` supplemented from Harrison's Chapter 321 (2026-10-04)

Same day, same request pattern as COPD/Sleep Apnea, but with an explicit pushback this time:
"مبحث aki رو با این تصاویر و فایل تکمیل کن **و از تصاویر استفاده کن**" (use the images),
after the user had already seen the no-embed policy applied twice. Read all 22 pages of
Harrison's 22nd ed. Ch. 321 (Acute Kidney Injury) plus the 5 attached figures (321-1 through
321-6, one page held two sub-figures). Checked the existing file first per the "supplement,
don't duplicate" discipline: its `nephro-aki` topic (built earlier this session from
handwritten contrast-nephropathy/Mehran-score notes — 47 flashcards/14 mcq/3 kfPmp/4 tables/
10 lesson sections) already had a KDIGO-staging table that was spot-checked and confirmed to
match Table 321-1 verbatim, so it was not re-added.

**Position on the images held, for the same reason as the first two times**: all 6 figures
carry the same McGraw Hill copyright line. "Use the images" was read as "capture everything
the figures teach," not as "embed the copyrighted artwork" — rule 6 doesn't bend to repeated
asks, only the depth of the non-infringing capture goes up. These 5 figures turned out
unusually well-suited to table reconstruction since they're box-diagrams/algorithms/anatomy-
labels rather than photographs or waveform traces, so the capture is more complete here than
in the COPD/Sleep-Apnea passes: every figure became its own markdown table (classification of
major AKI causes from Fig 321-1, GFR-autoregulation-and-drug-effects from Fig 321-2, causes-
by-nephron-segment from Fig 321-3, microvascular/tubular ischemic-injury events from Fig
321-4, postrenal-obstruction-sites from Fig 321-5, urine-sediment-interpretation from Fig
321-6), plus the two large text tables reproduced verbatim (Table 321-2, major causes/
clinical-features/diagnostic-studies for prerenal and intrinsic AKI; Table 321-3, management
of AKI). `images: []` stays empty, same as every prior chapter build this session.

Added 111 new flashcards (47→158: prerenal/intrinsic/postrenal pathophysiology in depth,
hepatorenal syndrome types 1/2, sepsis- and ischemia-associated AKI mechanisms, postoperative
AKI after cardiac/vascular surgery, nephrotoxin-associated AKI by drug class — contrast,
antibiotics, chemotherapeutics including checkpoint inhibitors, toxic ingestions, endogenous
toxins — glomerulonephritis as an AKI cause, postrenal mechanics, renal failure indices
(BUN/Cr ratio, FeNa, urine osmolality) and their caveats, urine sediment interpretation,
complications — uremia, volume, electrolyte/acid-base, hematologic, infectious, cardiac,
malnutrition — novel biomarkers (KIM-1, NGAL, suPAR, IGFBP7/TIMP-2, furosemide stress test),
treatment specifics per complication, and dialysis indications/modalities incl. HD vs. CRRT
vs. PD tradeoffs), 8 new MCQs (14→22), 3 new KF/PMP cases (3→6: lupus nephritis workup,
post-cardiac-surgery AKI mechanism, CRRT-vs-intermittent-HD mode selection in hemodynamic
instability), 8 new tables (4→12, the 6 figure-reconstructions plus Tables 321-2/321-3 above),
9 new lesson sections (10→19: definitions/epidemiology, detailed three-category pathophysiology,
renal failure indices, urine sediment, complications, biomarkers, general treatment principles,
dialysis indications/modalities, outcome/prognosis).

Build/validation notes: tables were first drafted as `{headers, rows}` objects (matching the
other new-chapter builds' scratchpad convention) and had to be converted to this schema's
actual `{title, markdown}` shape before validation passed — `content/_schema/
topic-content.schema.json` requires `markdown`, not `headers`/`rows`, for every table entry;
converted programmatically rather than hand-retyping. MCQs were first drafted with an
`answerIndex` key and had to be renamed to the schema's `correctIndex`; KF/PMP cases were
first drafted as flat `{stem, answer}` pairs and had to be restructured into the schema's
`{title, vignette, steps:[{prompt, expectedAnswer}]}` shape — the existing `nephro-aki`
KF/PMP entries were read first to confirm the correct shape before rewriting. All caught only
once `jsonschema.validate()` was actually run against the full schema, not assumed from the
other topics' field names — a reminder to validate against the schema file itself rather than
pattern-matching a sibling topic's scratchpad script, since kfPmp's and tables' actual shapes
aren't what a quick glance at `mcq`/`flashcards` would suggest. Also caught and fixed, mid-draft,
two instances of literal U+FFFD replacement characters that had silently been typed into a
table-building script in place of "و" inside "وازودیلاتاسیون"/"وازوکنستریکشن" — grepped for
`�` before running the script, not just after. Final validation: schema-valid, 0 جگر
occurrences, no duplicate ids across flashcards/mcq/kfPmp, a scripted Latin/Persian-adjacency
scan over only the newly-added content turned up 49 hits, all confirmed benign on inspection
(English acronym + Persian plural suffix with no ZWNJ, e.g. "NSAIDها" — already the
established convention throughout this repo, including the pre-existing parts of this very
topic — or abbreviation-adjacent-to-Persian-punctuation, never an actual grammar break), and
a 10-card random sample confirmed correct front→back direction. Synced to the artifact db
(version 1→2, ~88 KB). Bundle regenerated, still 52 topics (no new topic added, only an
existing one supplemented).

## `nephro-ckd` supplemented from Harrison's Chapter 322 (2026-10-04)

Picked up from an interruption earlier this session (a build script for CKD flashcards had
been written but never run — found and finished as the explicit "finish the unfinished
work" ask). Read all 22 pages of Harrison's 22nd ed. Ch. 322 (Chronic Kidney Disease) plus
the 3 attached figures. The existing `nephro-ckd` topic (63 flashcards/15 mcq/3 kfPmp/4
tables/14 lesson sections, built earlier this session from a background agent) already
covered CKD-MBD drug mechanisms, anemia/iron/ESA targets, ACEI/ARB nuance, AF/calciphylaxis,
PD peritonitis, and dialysis adequacy in depth — so the supplement focused on genuinely new
material: risk factors/genetics (APOL1, monogenic CKD, Table 322-1/322-2), GFR estimation
equations (Table 322-3), leading etiology categories (Table 322-4), the KDIGO risk
heat-map concept (Fig 322-1, rebuilt as a G-stage×A-stage grid table), intraglomerular-
hypertension/hyperfiltration pathophysiology (ties the gliflozin-TGF mechanism from Fig
322-5 into the existing ACEI/ARB section), bone-disease detail including tumoral calcinosis
as a distinct entity from calciphylaxis (Fig 322-3), cardiovascular complications (troponin
caveat, low-pressure pulmonary edema, uremic pericarditis as a dialysis-urgency indication,
reverse epidemiology), hemostasis/neuromuscular/GI/endocrine/dermatologic manifestations
(including NSF/gadolinium), diagnostic evaluation (imaging size exceptions, biopsy
contraindications, genetic-testing indications), and RRT preparation/timing. Added 40
flashcards (63→103), 8 MCQs (15→23), 2 KF/PMP cases (3→5: an ACEI-induced-GFR-drop
reassurance case, a tumoral-calcinosis-vs-calciphylaxis differential case), 6 tables (4→10),
and 7 lesson sections (14→21). Same build-script lesson as the AKI pass applied here too:
tables drafted as `{headers,rows}` then converted to the schema's `{title,markdown}` shape;
MCQs used `correctIndex` from the start this time (lesson learned); one KF/PMP id collision
with a pre-existing `ckd-kf-4` was caught by the id-skip logic (silently dropped the
duplicate rather than overwriting) and re-added under a fresh id (`ckd-kf-6`) rather than
being lost. Validated: schema-valid, 0 جگر, no duplicate ids, front→back direction spot-
checked on a random sample. Synced to the artifact db (version 1→2). Bundle regenerated,
still 52 topics.

## Copyrighted-figure policy reversed; images embedded in nephro-aki/nephro-ckd; highlighting extended to KF/PMP everywhere (2026-10-04)

Same day, a new message arrived: "اگه به مبحث نارسایی قلب نگاه کنی میبینی که از یک تصویر با
زیرنویس هاریسون استفاده کردیم. با ذکر منبع میتونی این کار رو با تصاویری که بهت دادم برای هر
مبحث بکنی." (if you look at the heart-failure topic, you'll see we used one image with a
Harrison caption — with source citation, you can do this for each topic with the images I
gave you.) Checked `cardio-hf/data.json`'s `images[]` and confirmed it: a real embedded
Harrison figure (Figure 265-3, GDMT mortality-reduction staircase) with a citation note —
pre-existing content the user had evidently already accepted, that the no-embed rule (rule 6
above) hadn't caught up with. This is a legitimate, explicit policy reversal from the user
for their own content, not something to keep resisting — updated rule 6 in place (see
above) rather than overriding it silently or leaving it stale.

**What got embedded, and what didn't, and why** (judgment still applies to *how many*, not
*whether*, per the updated rule): checked each topic's current db-doc size against the 256
KiB cap before deciding how many images that topic's budget could actually hold.
- **`nephro-ckd`**: the 3 attached images were Fig 322-2 (intraglomerular-hypertension
  schematic, 2-panel diagram — already fully captured as the KDIGO-grid/hyperfiltration
  tables and lesson prose from the CKD supplement above) and Figs 322-3/322-4 (tumoral
  calcinosis and calciphylaxis — real clinical photographs, the kind of visual pattern a
  table genuinely cannot replace). Embedded only the two photographs; skipped the diagram
  since its content was already fully captured elsewhere and doc size was closer to budget.
  Processed as JPEG (photographic content compresses far better as JPEG than the PNG-
  quantize method used for flat-color infographics elsewhere in this file) at quality 85:
  147KB/339KB/494KB originals → 56KB (unused)/29KB/39KB. Final doc size 234.5 KB / 256 KiB
  (89.5%) — tight but fits.
- **`nephro-aki`**: 5 attached images, all diagrams/algorithms already fully reconstructed
  as the 6 markdown tables from the earlier AKI supplement. Given this topic's doc was
  already supplemented heavily this session (71% of budget before any image), embedded only
  the single most load-bearing one — Fig 321-1, the three-way prerenal/intrinsic/postrenal
  classification flowchart that opens the chapter's Etiology section — via PNG palette
  quantization (flat-color diagram, same method as the Wilson infographic): 106.9KB →
  28.4KB. Final doc size 186.6 KB / 256 KiB (71.2%).
- Every embedded image's `note` field cites the source verbatim: "تصویر هاریسون؛ منبع:
  Harrison's Principles of Internal Medicine, 22nd Edition — Copyright © McGraw Hill." plus
  a plain-language description of what the figure shows and, where relevant, a pointer to
  the table/lesson section covering the same content in text form.
- Integrity verified the established way: SHA-256 of each source file compared against the
  SHA-256 of the re-decoded data URI read back from the saved JSON, both before syncing to
  the artifact db — all matched byte-for-byte.
- Not every attached figure got embedded, and that's deliberate, not an oversight: the
  user's own example was a **single** image per topic ("یک تصویر"), and the per-doc size
  budget plus the bundle-weight tradeoff (documented in the infographic section above —
  every embedded image adds to every visitor's unconditional page load) both argue against
  reflexively embedding all 5-6 figures per chapter when most of them are diagrams already
  captured losslessly as text/tables. If the user wants more of the AKI/CKD figures embedded
  specifically, that's a quick follow-up (the quantized/compressed files are already
  prepared in scratchpad), but it wasn't assumed without asking.

**Highlighting extended to KF/PMP, in both files, closing a dual gap.** The user also asked,
same message: "قابلیت هایلایت کردن رو در همه ی بخش ها از جمله kf pmp فعال کن" (enable
highlighting in every section, KF/PMP included). KF/PMP was the one remaining un-wired
content type in `docs/index.html` (lesson/flashcard-front/flashcard-back/MCQ-stem/MCQ-
explain/table-cells were already wired from earlier sessions) — added `kf:<id>:vignette`,
`kf:<id>:step<i>:prompt`, and `kf:<id>:step<i>:answer` loc-key wiring to the `kfPmp` render
branch, same generic `dataset.hlRawText`/`hlLoc`/`hlTopic` + `applyHighlightsToContainer()`
pattern as everything else; extended the هایلایت‌های من source-label branch with a "KF &
PMP" case; updated the education-tab intro sentence listing highlightable content types.

While doing this, re-confirmed (per the standing flag in the MCQ-numbering section above)
that the **live artifact was further behind than just KF/PMP** — it was missing flashcard-
front and MCQ-stem/explain wiring too, not just KF/PMP; only lesson/flashcard-back/table-
cells were wired there. Brought it to full parity in the same pass rather than leaving a
partial fix: added flashcard-front, MCQ-stem/explain, and KF/PMP wiring to the artifact's
`renderLearnPanel`, matching `docs/index.html` exactly loc-key-for-loc-key. Verified via a
full diff against the freshly-read pre-edit artifact HTML that only these intended blocks
(plus the matching intro-text and source-label edits) changed — everything else byte-
identical — before republishing (version 39).

Both files' extracted `<script>` blocks passed `node --check` after editing. `docs/
index.html` changes, the two content-file image/text additions, and the regenerated bundle
were committed together; the artifact was republished independently per its own versioning.

## Images tab blank-page bug, and COPD/Sleep Apnea images embedded (2026-10-05)

Immediate user follow-up, same day: "وقتی روی تصاویر مثلا ckd کلیک میکنم فقط صفحه سفید blank
میاد. ضمنا در copd and sleep apnea از تصاویر استفاده نکردی" (clicking an image in e.g. CKD
shows only a blank white page; also you didn't use images in COPD/Sleep Apnea).

**Root cause of the blank page**: the images-tab render code did `a.href = img.sourceUrl;
a.target = "_blank"` — a plain link meant to open the image in a new tab. That's fine for a
real URL, but every embedded image in this app is a `data:image/...;base64,...` URI, and
modern mobile browsers (Chrome Android, in-app webviews) **block top-level navigation to a
`data:` URL** as an anti-phishing measure — the new tab opens to a blank/`about:blank#blocked`
page instead of showing the image. This bug existed from the very first embedded image
(`endo-wilson`'s infographic) onward; it just hadn't been exercised on a phone until now.
**Fix**: for any `images[].sourceUrl` starting with `data:`, render an `<img>` element
inline in the panel instead of a link (caption above, image below, note below that) — never
navigate to a `data:` URI at all. Non-`data:` URLs (if any are ever used) still render as the
old link-in-new-tab. Applied identically to `docs/index.html` and the artifact; both
`<script>` blocks passed `node --check`. This also means every topic with an embedded image
now actually displays it in-panel rather than requiring a (broken) tap-through — a strict
improvement for `cardio-hf`, `endo-wilson`, `nephro-aki`, and `nephro-ckd` too, not just the
two topics added in this entry.

**COPD and Sleep Apnea now have embedded images too** — the earlier passes for these two
topics (see their own sections above) deliberately embedded zero images, reasonably at the
time since rule 6 still banned embedding outright; now that it's reversed, the user pointed
out the gap directly rather than letting it stand. Picked, per the same "visual teaching
value a table can't replace" judgment as the AKI/CKD pass — not every attached figure, just
the ones that are genuinely plots/photos/tracings rather than box-diagrams or decision rules
already captured losslessly as markdown tables (COPD's Fig 303-1/303-2/303-5/303-6 and
Sleep Apnea's Fig 308-1 stayed as tables/prose, unchanged):
- **`pulm-copd`**: Fig 303-3 (FEV1-by-pack-years population histogram) and Fig 303-4 (the
  classic A/B/C/D natural-history decline curves — the specific finding already in this
  topic's lesson prose, that most patients follow curve C not D, is now also visible in the
  actual plot). 64KB/57KB originals → 24.5KB/21.9KB via PNG quantization. Doc size 99.3KB →
  162.7KB / 256 KiB (62.1%).
- **`pulm-sleep`**: Fig 308-3 (normal vs. flow-limited inspiratory waveform, small/simple)
  and Fig 308-2 (the 4-panel real PSG tracing for obstructive apnea/central apnea/hypopnea/
  RERA — genuinely the single most exam-relevant image in this chapter, since recognizing
  these waveform patterns by eye is the actual tested skill, not just knowing the
  definitions already in Table 308-1). 18.5KB/157KB originals → 9KB/81.5KB. Doc size 90.4KB
  → 212.8KB / 256 KiB (81.2%) — healthy margin still, but if this topic needs a third image
  later, check the budget first.
- Same citation/verification discipline as the AKI/CKD pass: every `note` field cites
  Harrison's 22nd ed./McGraw Hill verbatim; SHA-256 of each source file matched the
  re-decoded data URI after writing, for all 4 images.

Synced to the artifact db (`pulm-copd` version 1→2, `pulm-sleep` version 1→2). Bundle
regenerated, still 52 topics. Artifact republished with both the images-tab fix and the new
image data (version 40).

## `cardio-ecg` supplemented from Harrison's Chapter 247 (2026-10-05)

Built from the user-uploaded 14-page PDF (Harrison's 22nd ed., Ch. 247, Electrocardiography)
plus 11 attached images, under the now-standing image-embedding protocol (rule 6) — applied
automatically per the user's explicit "از این به بعد... بدون اینکه ازت بخوام" instruction,
not asked about per-image this time.

**Scope discipline — this topic already had real content, not an empty shell.** Before
writing anything, read the existing `content/cardio/cardio-ecg/data.json`: it holds 3 complete
interactive HTML modules embedded via `lesson[].embedPath` (Module 1 — systematic approach/red
flags; Module 5 — STEMI and equivalents: de Winter, Wellens, Sgarbossa, posterior MI; Module 6 —
electrolyte ECG changes: hyper/hypokalemia, hyper/hypocalcemia), confirmed deliberate and
complete by checking `content/cardio/cardio-arrhythmia/modules/` for modules 2–4 (wide-complex
tachycardia, narrow-complex tachycardia, bradyarrhythmias/AV block) — the 6-module course is
split across two topics by design, nothing missing. The 3 existing `lesson` entries were kept
byte-for-byte unchanged; only `flashcards`/`mcq`/`kfPmp`/`tables`/`images` were added. New
standard content covers everything the 3 modules don't (electrophysiologic basics, waveforms/
intervals/QTc formulas, lead placement, axis, chamber enlargement/hypertrophy, bundle branch
blocks, general ischemia/infarction principles, metabolic/drug effects beyond K+/Ca2+ — i.e.
hypothermia/Osborn wave, TCA overdose, digitalis effect, low voltage, electrical alternans/
tamponade, the 14-parameter clinical-interpretation framework) and stays brief with an explicit
cross-reference (e.g. "جزئیات کامل در ماژول ۵") wherever a new card would otherwise re-teach
something the modules already own in depth (Wellens sign, hyperkalemia/hypokalemia T-wave and
QRS changes, hypercalcemia/hypocalcemia QT changes).

**Images**: each of the 11 attachments was individually matched to its Harrison figure number
by direct visual comparison against the PDF pages (not assumed from upload order). Bucket (a)
— not embedded, fully captured as text/tables already in the new content: Fig 247-1 (conduction-
system anatomy), Fig 247-4 (hexaxial axis wheel), Fig 247-11 (current-of-injury schematic).
Bucket (b) — embedded, real ECG tracings a table can't replace: Fig 247-8 (P-wave chamber
enlargement), Fig 247-9 (QRS hypertrophy patterns), Fig 247-10 (RBBB/LBBB V1/V6 morphology),
Fig 247-13 (anterior/inferior infarct evolution), a precordial ST-elevation strip (exact figure
number not confidently matchable to a named callout in the chapter text — captioned generically
rather than guessing wrong), Fig 247-12 (Wellens T-wave sign), Fig 247-16 (QT changes in
hypo/hypercalcemia), Fig 247-15 (6-panel: hypokalemia/hypothermia/amiodarone/TCA overdose/SAH).
All 8 processed via PNG palette quantization (flat ECG-tracing line art, same method as the
AKI/CKD diagrams) — 170.2KB total originals → 85.9KB quantized (~114.9KB as base64). SHA-256 of
each quantized file verified byte-for-byte against the re-decoded data URI read back from the
saved JSON — all 8 matched. Every `note` cites Harrison's 22nd ed./McGraw Hill verbatim plus a
plain-language description and, where applicable, a pointer to the matching table or module.

**Content added**: 100 flashcards, 16 MCQs, 3 KF/PMP cases (WPW-complicated AFib with wide
irregular QRS — why AV-nodal blockers are dangerous; RBBB/bifascicular block presenting as
syncope; inferior STEMI — right-sided/posterior lead workup before nitroglycerin), 6 tables
(QTc formulas, axis-deviation causes, chamber-enlargement/hypertrophy criteria, ST-elevation
differential diagnosis, bundle-branch-block V1/V6 patterns, infarct-evolution timeline), 8
images. Doc size (flashcards+mcq+kfPmp+images+tables+lesson) = 164.0 KiB / 256 KiB (64.1%) —
comfortable headroom since this topic's standard content started from zero.

**Validation note — pre-existing schema/data mismatch, not introduced here**: this topic's 3
`lesson` entries use `{heading, embedPath, embedNote}` (the interactive-module pattern), but
`content/_schema/topic-content.schema.json`'s `lesson` items require `{heading, body}` — the
committed file already failed strict schema validation on `lesson` *before* this session's
edit (confirmed by validating the pre-edit file). Validated everything else (flashcards/mcq/
kfPmp/images/tables, plus `topicId`/`category`) against the schema with `lesson` excluded from
that one check — all passed. 0 جگر occurrences, 0 duplicate ids across flashcards/mcq/kfPmp,
all `mcq[].correctIndex` in bounds, 10-card random sample confirmed correct front→back
direction, and the Latin/Persian-adjacency grammar scan's 60 hits were all the already-
established benign pattern (Latin abbreviation + Persian punctuation or plural suffix, e.g.
"ECGهای", "۴۶۰ms،") — no actual rule-3 grammar breaks.

Synced to the artifact db as `topic_content/cardio-ecg` (version 1→2, via `set` pinned to the
pre-existing version — only the `lesson` field had any content before). Bundle regenerated,
still 52 topics (no new topic, only an existing one supplemented).
