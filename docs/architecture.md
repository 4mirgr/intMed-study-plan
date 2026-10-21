# IntMed architecture

## Public educational content

Canonical content lives under `content/`. The build emits:

- `docs/content/taxonomy.json`: navigation metadata;
- `docs/content/manifest.json`: counts, hashes, and per-topic paths;
- `docs/content/topics/<topic-id>.json`: one payload per topic;
- `docs/content/images/<topic-id>/...`: externalized image files.

The browser fetches only taxonomy + manifest at startup and loads a topic on first open.
This avoids downloading or parsing every topic and every embedded image for a normal visit.

## Stable anchors

Content objects have durable IDs. Lesson paragraphs use their own IDs instead of array
positions. Published paragraphs also carry their former positional anchor (`legacyLoc`) so
existing highlights can be upgraded when rendered. New source-backed content should attach
`sourceRefs` at paragraph/question/table/image level.

## Private user backend

The public repository must contain no passwords, weak password hashes, GitHub write tokens,
profiles, tickets, notes, or highlights. The target backend is Supabase Auth + Postgres with
row-level security. SQL migrations and the browser adapter live under `backend/supabase/`
and `docs/js/`.

The migration sequence is:

1. create a private Supabase project and apply the SQL migration;
2. add the public project URL and anon key through the deployment configuration (never a
   service-role key in browser code);
3. create/invite users in Supabase Auth;
4. run the one-time admin migration utility against an exported legacy `state.json`;
5. verify each user can read/write only their own state and admins can manage profiles;
6. disable the legacy GitHub-PAT/FNV login path.

Until backend configuration is supplied, development can run in explicit local-demo mode,
but that mode is not suitable for real users or personal data.

## Deployment

GitHub Actions validates source content, rebuilds deterministic generated output, and deploys
`docs/` to GitHub Pages. A failed validation/build check blocks deployment. Medical review
remains a human approval step.


## UI boundaries and cache safety

The page markup is `docs/index.html`; styles are `docs/intmed.css`. Runtime code is
split into theme, login, study-app and backend files under `docs/js/`. Routine
content authoring never requires rereading those UI files. Generated topic payloads
remain under `docs/content/` and existing stable ids/legacy anchors are preserved.
`version_assets.py` versions local JS/CSS/config URLs after configuration is written;
per-topic requests include their manifest hash to avoid stale cached lessons.

A stored private session is checked against the authorized profile before the app
is revealed. CURRENT_USER_ID comes from the private session rather than a mutable
legacy preference. Login/signup/reset pass private passwords unchanged; legacy
phone-number normalization is limited to the local demo path.

Private saves write only the current user's changed study state. They read the
latest row, merge locally changed item keys and highlight ids into it, and update
with an updated_at comparison. A colliding save rereads/remerges before retrying.
Unchanged profiles/tickets are not sent back; an admin's routine save never rewrites
other users' study snapshots. This reduces traffic and stale-device data loss.
Sign-out is scoped locally so logging out of IntMed does not invalidate another
application's refresh sessions in this shared Supabase project.

Run `node scripts/backend_state_test.mjs` for the synthetic concurrent-write and
admin-save regression tests. No production notes or credentials are used.

## Owner activation check

The production public URL/key are configured and anonymous reads of profiles,
study_state and tickets are denied. Table existence alone does not prove that the
owner's role/approval or legacy data import is complete. Use the read-only
`backend/supabase/verify_admin.sql` in the owner's SQL Editor, and only if needed
the explicit verified-email `bootstrap_admin.sql`. No passwords or privileged keys
need to be sent in chat. No live personal state was read or migrated by the UI
hardening update. End-to-end acceptance uses two real approved accounts after
owner verification; synthetic tests cannot establish those production identities.

### Topic favorites and private popularity counts

A favorite uses the stable key `favorite:<topic-id>` in that user's existing
`study_state.state.itemState`, with `{favorite: true|false}`. It is a separate key
from the topic's note/status, so toggling either does not overwrite the other and
existing per-key concurrent-save merging applies. No SQL upgrade or GitHub token
is needed. Hearts wait for the initial private state load before accepting input.
Dashboard/profile shortcuts open the category and topic and account for the sticky
header height. Admin popularity counts are computed from the study rows already
readable by the admin under existing RLS: one active favorite per user/topic,
excluding unknown taxonomy IDs. Counts are not pageviews. The refresh action first
finishes pending writes and then fetches current state; clean private snapshots
no longer overwrite newer server changes during reconnection. Ordinary members
receive only their own state and never receive other users' favorite lists.

### Email recovery UI

Forgot-password is an email-only form calling Supabase Auth `/recover` with the
site URL as `redirect_to`; there is no WhatsApp recovery path. The success message
does not reveal whether an address exists. A recovery link captures the temporary
Auth session, removes tokens from the URL, verifies matching new passwords, updates
the password via Auth, signs out and returns to login. Hash-only links in an already
open tab are supported. Study sync is paused for recovery sessions. The email
provider, delivery and allowed redirect URLs remain Supabase project settings;
browser tests mock email delivery and do not send messages to actual users.

### Dashboard, profile editing and account identity

`docs/js/intmed-dashboard.js` owns the new personal/admin metric cards, weekly
activity charts, recent topics, review suggestions, manual study tags, first-answer
quiz summary and CSV topic analytics. It uses existing private study_state only:

- `tag:<topic-id>` stores selected tags and timestamps (including completedAt).
- `activity:<topic-id>:<Tehran YYYY-MM-DD>` stores opens, active seconds, content
  type counts and lastOpenedAt. Counters merge additive deltas across concurrent
  device saves. Clean reconnects accept fresh server state.
- `quiz:<topic-id>:<stable-question-id>` stores the first recorded MCQ answer's
  correctness and timestamp; repeated answers do not inflate the question count.

Activity begins only after a content tab loads. Hidden tabs, closed panels and
extended inactivity do not add active time; tab switches flush the current slice.
This is an approximate activity metric, not proof of reading or a proctored exam.
No historical activity is invented. Manual 'مطالعه‌شده' marks are separate from
content opens, favorites and the old knowledge-status pills.

Profile PATCH requests whitelist basic biographical fields and target the current
session UUID. They never replace study_state. Optional fields can be cleared.
Email is read-only in profile editors: the account action requests a verified Auth
email change. The additive dashboard SQL synchronizes verified Auth email and
revokes direct browser writes to profiles.email. Username changes use a checked
RPC, preserve UUIDs and cannot change roles or approval flags. The owner-only
rename script refuses multiple active admins or an unverified owner email.

### Signup notifications

See `backend/supabase/TELEGRAM_SETUP_FA.md`. Telegram credentials live only in Edge
secrets. The setup SQL creates a private outbox and an asynchronous pg_net signup
trigger scoped to new IntMed Auth metadata. A failed notification never rolls
back signup. The Edge Function verifies the actual pending profile and Auth
identity before sending just a username and management link, never personal study
content/contact details. Atomic service-only claims prevent normal duplicate
sends; pending/error deliveries can be retried explicitly by an authenticated
admin. Setup, chat discovery/selection, test and retry actions require a live,
approved, non-rejected admin identity. Notifications do not grant access.

The bot is free to use; its deployment and secret setup are owner-only steps.
No real Telegram message is sent by automated tests. End-to-end iPhone delivery
must be checked after the owner installs the function, adds its bot secret,
starts their private bot chat and chooses it in the admin UI.

## Personal notebook and reading palettes

The dashboard notebook derives separate searchable notes/highlight lists from only the
current user bucket. Topic notes and highlight notes retain their existing storage keys;
source shortcuts load just the target topic and reveal the saved highlight anchor, including
hidden answers. Unknown legacy topics stay readable in the notebook. Removing a favorite
writes the existing `favorite:<topic-id>` flag and leaves annotations intact. No SQL migration
is needed for these views.

`bp_theme` stores `light`, `dark`, or `night-shift` per browser. Light uses a cream canvas;
Night Shift uses warm colors and is not an operating-system display filter. Explicit choices
override the system preference and synchronize across tabs. Dark highlight palettes maintain
readable text contrast. `annotations_theme_browser_test.mjs` verifies notebook isolation,
source navigation, removal persistence, saved palettes, contrast, and narrow-screen layout.

## Notebook PDF and update newsletter

Notebook export uses a same-origin blank window filled with text-only DOM, local Persian
font and A4 print styles. Members export their own notebook; active admins choose one loaded
account. Notes and highlights can be exported together or separately. Nothing is sent to an
external PDF converter. Use the browser print dialog's Save as PDF option.

Newsletter consent is private `itemState["newsletter:subscription"]` with a boolean, current
verified email snapshot and timestamps. Existing members are not automatically enrolled;
email changes require a new opt-in. Membership can be revoked from the profile. CSV export
is admin-only and includes only active consenting accounts matching their current email.

Prepared (not automatically installed) server files: `backend/supabase/newsletter.sql`,
`functions/intmed-newsletter/index.ts`, and `NEWSLETTER_SETUP_FA.md`. Delivery uses Resend,
requires a verified sender, server-only API/signing secrets and manual admin action. The
Edge Function validates the real Auth user plus active admin role for preview/test/send,
rechecks consent and the Auth-confirmed recipient email before each message, sends to one
recipient, and claims a private unique campaign/user delivery record before contacting the
provider. It never automatically retries uncertain or failed delivery. Signed unsubscribe
links show a confirmation on GET; POST changes only the newsletter key using CAS, preserving
concurrent study edits. Admin draft campaign IDs survive refresh in the same browser tab;
use New newsletter intentionally for a new send. Subject/body changes after a campaign
starts are rejected. There is no automatic publication-triggered emailing or scheduler.

New ECG image questions use the existing stable IDs/imageRef contract, source-specific
figure credits and source links. Option explanations are shown only after answering. They
are authored practice questions, not claimed copies of official examinations. Source and
visual checks are recorded in `content/cardio/ECG_IMAGE_REVIEW.md`; clinical accuracy still
needs the teacher's final review under the content protocol.
