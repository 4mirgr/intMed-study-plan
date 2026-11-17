# System review — 2026-11-17

## Scope and preservation

Reviewed the installed-PWA/authentication boundary, client state isolation,
public-content loading, source-question integration, recurring checks, test
entry points, agent instructions and background publication. No real account
passwords, private notes or unapproved source drafts were used for tests.

Baseline: 88 canonical topic packages, 149 generated navigation/topic payloads
and 174 files under `content/`. The canonical inventory SHA-256 is
`0413874e2a41229834f8b6a3db46ddeb1fbe0889dd2841db295b49fb92506ad1`.
Source/asset hashes and generated-content checks are compared after repairs;
no medical text, images, questions or stable anchors are intentionally removed.

## First repair checkpoint

- A delayed refresh could restore a session after logout, overwrite a newer
  account or clear it after an old rejection. Session generation/identity guards,
  immediate local logout and per-session refresh single-flight reject stale
  completions while retaining ordinary refresh/recovery behavior.
- Source-question publication assigned IDs from list positions. Stable source
  identity bindings now survive reorder, insertion, removal and return. Removed
  IDs remain reserved; ambiguous duplicates fail before writing. Authored rows
  without a source ID use a stable content fingerprint. Actual source text and
  unrelated items remain unchanged.
- One canonical set of local auth/core/browser profiles is reused by CI. The
  fast smoke command is retained and clearly distinguished from all 18 browser
  suites. Full CI still supplies SQL/server/Python checks beyond these profiles.
- Cheap credential-free HTTP origin checks run daily at 06:47 Tehran; live
  Chromium/WebKit checks run Saturday at 07:17. No model calls or real account
  login are used for monitoring.
- `TASK_ROUTING.md` selects narrow files/checks and compact worker packets.
  Historical generation/library descriptions are labeled, not deleted.

The regressions were observed failing before their repairs. Focused auth/state,
40 runner tests, adjacent publication/question tests and all 18 browser suites
are included in verification. Hosted full CI and root browser/combined-build
gates remain mandatory before advancing hosting.

## Background-publication gate

Review also reproduced an unattended publisher accepting a host advance while
the exact release's CI failed. A gate alone would stall bot publications because
`GITHUB_TOKEN` pushes normally do not start push workflows. A separate checkpoint
must explicitly validate an immutable exact-release reference, wait with a bound,
and enforce success again server-side before hosting or a successful result.
This paragraph records the discovery; completion evidence is recorded below
when that checkpoint is implemented and tested.

## Existing content-review backlog

Schema/generation checks pass with zero errors. The independent quality audit
reports 8,304 warnings and 1,517 review notices, mainly missing source references
(6,936), distractor-review metadata (1,080), and legacy image provenance/rights
metadata. These are findings to review, not evidence that every flagged claim is
wrong. Nothing was deleted, automatically medically rewritten or falsely marked
reviewed to suppress them. Automated structure checks do not certify accuracy.

## Constructive next improvements

1. Prioritize teacher review and source references for clinical decision/dosing
   material before expanding generated volume; retain uncertain units as drafts.
2. Benchmark three representative inputs for source coverage, review effort,
   generation time and cost before changing approved models or providers.
3. Add a small admin health/release view showing the last successful origin check,
   active release and publication-stage failure, without exposing logs or secrets.

These are proposals, not claims of completed clinical review, a measured model
quality improvement or permission to transmit new private sources to providers.
