# IntMed repository guide

Read this file first. Read only the linked document relevant to the task; the archived
session history is not required for routine work.

## Repository map

- `content/taxonomy.json`: categories and topics shown by the site.
- `content/<category>/<topic-id>/data.json`: canonical educational content.
- `content/_schema/topic-content.schema.json`: content contract.
- `docs/`: generated/published GitHub Pages site.
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
