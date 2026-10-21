# IntMed repository guide

Read this file first. Read only the linked document relevant to the task; the archived
session history is not required for routine work.

## Repository map

- `content/taxonomy.json`: categories and topics shown by the site.
- `content/<category>/<topic-id>/data.json`: canonical educational content.
- `content/_schema/topic-content.schema.json`: content contract.
- `docs/index.html`: small page markup; `docs/intmed.css`: UI styles.
- `docs/js/intmed-{theme,login,app,backend}.js`: separate UI/auth/storage code.
- `docs/content/`: generated educational payloads. Other `docs/` files are site sources.
- `scripts/content_pipeline.py`: initialize, migrate, validate, extract, and build content.
- `docs/content-protocol.md`: complete chapter-production and medical-content rules.
- `docs/architecture.md`: application, persistence, deployment, and migration design.
- `docs/archive/CLAUDE-history.md`: historical session notes; consult only for archaeology.

## Required workflow

1. Preserve existing user changes and use the existing checkout; do not create a worktree.
2. For content work, read `docs/content-protocol.md` and only the target topic JSON.
3. Run `python3 scripts/content_pipeline.py validate` before and after content changes.
4. Run `python3 scripts/content_pipeline.py build` after content or taxonomy changes.
5. Run `python3 scripts/content_pipeline.py check` before committing/publishing.
6. Do not hand-edit generated files under `docs/content/`.

Do not put credentials, personal access tokens, raw passwords, or private user data in the
repository. User accounts and personal state belong in the private backend described in
`docs/architecture.md`, never in public GitHub content.

After changing scripts/styles/config, run `python3 scripts/version_assets.py`.
Run `node scripts/backend_state_test.mjs` for persistence conflict/isolation checks.

Dashboard/analytics UI lives in `docs/js/intmed-dashboard.js`. After changing dashboard
SQL source files, run `python3 scripts/build_dashboard_setup.py`; never add bot tokens.

Persisted practice rounds/planning are documented in `docs/exams-and-planning.md`; the
exam engine is `docs/js/intmed-exams.js`. Run `node scripts/exams_unit_test.mjs` and the
workspace browser test after exam changes. Optional notification/security SQL is bundled
with `python3 scripts/build_services_setup.py` (checked in CI).
