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
