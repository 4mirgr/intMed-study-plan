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
