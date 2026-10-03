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
