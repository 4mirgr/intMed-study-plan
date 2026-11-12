# Safe website maintenance

The uploaded CODEX-EXTENDED-LIBRARY.md is a discovery catalog, not a command to
install or execute every entry. Its SHA256 is
`458aca591fefb0f37cadde315c9364365f8f023da9cf995b6770acf41305c7ce`.
Two relevant MIT-licensed skills are installed under `.agents/skills/`, with
upstream LICENSE notices, scripts and references:

- `ci-cd-pipeline-builder`
- `dependency-auditor`

Source: https://github.com/alirezarezvani/claude-skills/tree/9ca476d8401f8750f92f4a7b31ec68efaa61ab02/engineering/skills
These are project-local files for compatible Codex clients, not a global plugin
installation on the owner's Mac. New sessions may be needed for automatic skill
discovery. The catalog stays an intake reference, not public website content.
Upstream example `test-project/`, `expected_outputs/` and two sample manifests
are not installed; they are not helper runtime prerequisites. The offline scanner
and stack detector do not recognize this project's `requirements-dev.txt` as a
Python manifest. Use the explicit workflow pip audit for that file; never interpret
an empty helper result as a clean Python dependency inventory. No helper was
executed or added to CI automatically during installation.

## Operating contract

Preserve the vanilla public UI, canonical topic IDs/annotations, private Supabase
state isolation, Tehran dates, and exact host mounts/pins. Read the task-specific
skill, map its recommendations to the existing architecture, inspect helper code
before execution, then verify a small change. Do not regenerate an existing CI
pipeline from an upstream template or treat an offline CVE pattern scan as a live
vulnerability or license clearance.

## Automated, bounded work

- Existing full CI runs for PRs/pushes. Pages/OIDC write permission is confined to
  the deploy job; validation has read-only repository permission and no production secrets.
- Dependabot configuration prepares weekly npm/pip/Actions update PRs against
  `claude/quirky-ride-mavb6b` with low PR limits. Compatible npm/pip changes are
  grouped. Major version updates require a separate migration; security updates
  can still require individual review. No auto-merge is enabled.
- `Website maintenance` runs weekly and on manual dispatch; dependency/config PRs
  also trigger it. It checks canonical/generated integrity, private-save/PWA/exam
  regressions, records content review findings, and queries live npm/Python
  advisory services. A service/network error is a failed scan, not a clean result.
- Scheduled Actions and Dependabot config must exist on the repository's default
  branch to activate. The default branch was verified as
  `claude/quirky-ride-mavb6b` during this change. Dependabot service/repository
  policy and Actions enablement remain GitHub settings, not guaranteed by YAML.
- Content review notices are not automatically corrected, approved or emailed.
  New providers, paid scans/models, live migrations, access/DNS changes, private
  book-image publication and destructive changes need separate decisions.

## Release and rollback

For coordinator releases, verify the exact source commit's CI, then change only
the IntMed pin in fresh `gerami-website/deploy/projects.json`, preserving AUS and
other fields. Verify the actual Cloudflare production commit and mounted assets.
Never infer production from a GitHub Pages success alone. Rollback means a
reviewed host-pin change to a known-good release, not resetting the dirty checkout
or rolling back user data. Branch protections/approval rules must be verified in
GitHub; this configuration does not claim to have installed them.

## Review evidence and remaining scope (2026-11-12)

Fixed actual SW index names and mounted paths; offline metadata now prefers a
newer public runtime cache over the original install cache. Regression tests
failed before the fix and pass afterward; private/API cache exclusions remain.
Synthetic browser smoke, auth, login recovery and real Chromium SW scenarios
were exercised without touching live accounts.

Local SQL tests needing PGlite were not runnable because that dependency is
absent; full CI installs it. Local proxy policy blocks npm/PyPI advisory endpoints,
so no current CVE clearance is claimed from this environment. The scheduled
advisory jobs provide a separate live check once activated.

Root-site review confirms its exact-pin build runs significant IntMed checks,
but not the full IntMed or root UI suite. A companion root-repository checkpoint
adds weekly/PR offline static, CMS OAuth, AUS gateway and connection checks plus
pip/Actions update PRs, without modifying UI, OAuth credentials or AUS pins.
Background content publication still does not require
the complete source CI to succeed before requesting a host-pin advance; the host
still runs its own subset of tests. Strengthening that cross-repository gate and
full root browser coverage are follow-up checkpoints, not claimed complete here.

No comprehensive clinical, real-user RLS/email/device, legal license, penetration
test, or all-page accessibility/SEO certification is implied by these checks.
