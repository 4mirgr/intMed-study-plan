# Focused task routing

Start with `AGENTS.md`, the current remote source SHA and actual hosting pin.
Preserve the existing checkout. Use `rg -n '^##' docs/PROJECT_STATE.md` to locate
relevant current decisions rather than reading the whole historical handoff.

| Task | Read first | Focused checks |
| --- | --- | --- |
| Login/session/PWA | Target backend/login/SW file; `pwa-login-origin-repair-2026-11-14.md` for deployed origins | `npm run test:auth`, `npm run test:browser:auth` |
| Public topic/library loading | Target app/library module and generated manifest | `npm run test:core`, `npm run test:browser:content` |
| Private notes/dashboard/exams | Target module and relevant architecture/exams section | state/exam unit checks; `npm run test:browser:workspace` |
| Canonical educational content | `content-protocol.md`, target topic JSON and source digest | validate, build, check; targeted quality audit and manual source review |
| PDF/question-bank intake | Relevant `AGENTIC_CONTENT.md` section, cached extraction manifest, target source IDs | runner/question/publish tests; preserve existing identity bindings |
| Background publication | `BACKGROUND_PUBLICATION.md`, publisher bridge and workflow | publisher/queue tests, exact-release gates and mounted-byte verification |

Browser profiles need a local `docs/` server on port 8765 (or `INTMED_BASE_URL`)
and installed development dependencies. For example, run
`python3 -m http.server 8765 --directory docs` in a separate terminal. Use
`PLAYWRIGHT_EXECUTABLE_PATH` when using an existing Chromium executable.
Missing dependencies or network access are blockers, not passing checks.

For a broad review, capture canonical file hashes and stable IDs before changes;
compare them afterward. Do not delete, silently rewrite or mark clinical content
reviewed to make an audit green. Structural tests do not certify medical claims.

Use one compact worker packet: goal, observed failure, source SHA, relevant
files/cache hashes, exclusive file ownership, required evidence and test command.
Workers return the cause, patch scope, RED/GREEN evidence and unresolved limits;
they do not deploy. Reuse extraction/model-stage caches and completed checks until
new changes or failures justify rerunning them. Do not resend complete PDFs or
load all skills/history into every worker.

Coordinator releases still require full source CI, a fresh host-pin read that
preserves AUS, the root browser/combined-build gate and the active Cloudflare
deployment. A GitHub Pages success or a local smoke result alone is insufficient.
