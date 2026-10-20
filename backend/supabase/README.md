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
