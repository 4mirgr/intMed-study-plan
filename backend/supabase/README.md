# Supabase setup

1. Create a private Supabase project and apply `schema.sql` in the SQL editor.
2. Create the first user through Supabase Auth, then set that profile's `role='admin'` and
   `approved=true` in the SQL editor.
3. Configure the public project URL and anon/publishable key in `docs/config.js`, or set
   GitHub Actions variables named `INTMED_SUPABASE_URL` and `INTMED_SUPABASE_ANON_KEY` to
   override that file during deployment. An anon/publishable key is intentionally public
   and protected by RLS. Never put the service-role key in the site or commit it. The
   deployment validates whichever public configuration it uses before replacing the site.
4. Create/invite remaining users. Approve each profile after identity review.
5. Export the old GitHub `state.json`, create a local legacy-ID → Supabase-UUID mapping, and
   run `migrate_legacy_state.py` with service credentials supplied as environment variables.
6. Verify RLS with two non-admin test accounts before disabling legacy mode.

Legacy passwords use an unsuitable FNV hash and cannot be migrated safely. Every user must
set a new Supabase Auth password through an invite or password-reset email.

## Verify the owner account without sharing credentials

Run `verify_admin.sql` in SQL Editor after replacing its placeholder with your own
Auth email. The expected row is `role=admin`, `approved=true`, `rejected=false`.
No result means the IntMed profile does not exist yet. `bootstrap_admin.sql` can
create/approve ONLY the explicitly specified verified owner account. It refuses a
placeholder/unverified account; it does not change passwords or other users.

The current project already has the IntMed tables. Do not reinstall or replace a
shared project's schema just to check the admin account. Verify the owner first.

### Username sign-in and registration upgrade

Existing sessions, UUIDs, approvals and study_state stay unchanged. Email password
sign-in remains compatible during rollout; new UI requests a username. Email is
still required for verification/recovery, and is never exposed by a public lookup.

For a fresh installation, apply `schema.sql` first, then this upgrade.

1. In the existing project's SQL Editor run `registration_upgrade.sql` (not the
   entire schema again). It only adds profile fields, a case-insensitive username
   uniqueness index and a server-only login rate budget, and updates the existing
   signup trigger. If case-duplicate usernames exist it rolls back safely.
2. In Supabase → Edge Functions → Deploy a new function → Via Editor, create
   `intmed-login`, paste `functions/intmed-login/index.ts`, deploy and disable
   **Verify JWT** for this function (it handles unauthenticated password login).
   Supabase's default server environment supplies SUPABASE_URL,
   SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Never copy the service key
   into this website or the chat.
   CLI alternative, from repository root:
   `supabase --workdir backend functions deploy intmed-login --project-ref upwbktvnybsjugdegjji --no-verify-jwt`
3. Test an approved existing username/password. Signup collects required full name,
   username, password, degree and email. Phone, specialty and province are optional.
   New fields are visible to the owner/admin under the existing RLS rules.

The Edge Function looks up the Auth email only on the server and exchanges the
password through Supabase Auth. Errors never return the lookup email. Attempts
are limited per hashed username and client IP to 30 per ten minutes. Do not
publish any separate anon RPC returning users' emails. Existing approval and
study-state access rules still apply after password authentication.

### Admin user removal (existing shared project)

Run `delete_user.sql` once in SQL Editor. Installing it does not remove anyone.
The administrator can then expand a user's card and choose **حذف کاربر از IntMed**.
The confirmation names the user and explains the permanent removal of their
profile, study progress, notes, highlights and tickets. Cancelling sends no request.
Errors keep the card visible. The checked RPC only allows an approved, non-rejected
admin to remove a non-admin; self-removal and deletion of any admin are rejected.
The deletes are atomic and stale browser writes cannot recreate removed state/tickets.

This is **IntMed membership/data removal**, not deletion of the shared Supabase
Auth identity. That distinction protects the other applications in this project.
A removed user cannot read IntMed data or pass IntMed's profile/approval gate,
even with a previously issued Auth token. Their Auth identity may still appear
in Supabase Authentication. Restoring IntMed membership would require an explicit
admin action; repeated signup does not recreate an existing Auth user's profile.

Validation: `node scripts/delete_user_sql_test.mjs` runs PostgreSQL security and
rollback scenarios in a local in-memory database with synthetic identities only.
`node scripts/delete_user_browser_test.mjs` covers confirmation cancellation,
request failure, success and the non-admin UI with mocked private APIs.

### New dashboard, manager username and Telegram notifications

Start with [the Persian setup guide](TELEGRAM_SETUP_FA.md). The generated
`setup_dashboard.sql` bundles the additive dashboard security upgrade, the guarded
owner rename to `drgerami` (same verified Auth email/UUID/password) and the private
notification outbox/trigger. Regenerate using `python3 scripts/build_dashboard_setup.py`.
The bot secret goes only in Supabase Edge Secrets; `intmed-signup-notify` must have
JWT verification enabled. The original `intmed-login` function keeps it disabled.

Basic profile editing, tags, pink favorites and activity/quiz analytics are frontend
changes; username RPCs, email protection/synchronization and automatic Telegram
notifications additionally require the one-time SQL/server installation.

### Email update newsletter (optional installation)

See [the Persian newsletter guide](NEWSLETTER_SETUP_FA.md). Install `newsletter.sql`,
deploy `intmed-newsletter` with gateway JWT verification OFF (signed public unsubscribe;
active admin/Auth validation is enforced in code for every management action), and set
`RESEND_API_KEY`, `NEWSLETTER_FROM`, and `NEWSLETTER_SIGNING_SECRET` only in Edge Secrets.
No existing user is auto-enrolled. Browser UI includes consent/revocation, admin preview,
self-test and manually confirmed 20-recipient batches. No real messages are sent by tests.
The SQL installation is independent of `setup_dashboard.sql` and does not change existing
profiles or study data. Run `node scripts/newsletter_test.mjs` for security/regression checks.

### Free local LM Studio content runner

For the private Telegram inbox, install `local_content_runner.sql`, deploy
`functions/intmed-local-runner/index.ts` with gateway JWT verification off, and follow
`scripts/local_runner_setup_fa.md`. The function performs its own Auth/admin validation. The Mac
stores only a refresh token in Keychain and a public API key; never copy `service_role` locally.
The runner creates review drafts only and leaves paid OpenAI processing disabled.
On macOS, double-click `scripts/setup_intmed_lmstudio.command` for server discovery, recommended
model selection, Keychain login verification and optional LaunchAgent background execution.

### Single install for services and least-privilege policies

Use [the short Persian guide](SETUP_SERVICES_FA.md) and generated `setup_services.sql`
for notification SQL, verified-email protection and owner-only browser study-state writes.
It does not rename the manager or change passwords. Regenerate using
`python3 scripts/build_services_setup.py`. Keep `setup_dashboard.sql` as the existing
standalone dashboard/owner-rename installer; the two files intentionally have different scope.
