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
