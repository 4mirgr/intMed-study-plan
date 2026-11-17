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

First checkpoint published: source
`57506a522492b83fa39455bb8bbbc2854cfe0df0` passed full CI and live origin
diagnostics. Root PR #21 passed browser/combined-build checks and advanced only
the IntMed pin in root commit `4cca182d69a298d5cd70ac08c44c263e6b98a982`.
Cloudflare reported that production commit successful; a fresh request to the
owner's installed-PWA origin returned HTTP 200 and backend asset
`6886592286496f5b`. All 174 canonical/source asset hashes remained identical.

## Background-publication gate

Review also reproduced an unattended publisher accepting a host advance while
the exact release's CI failed. A gate alone would stall bot publications because
`GITHUB_TOKEN` pushes normally do not start push workflows. A separate checkpoint
must explicitly validate an immutable exact-release reference, wait with a bound,
and enforce success again server-side before hosting or a successful result.
This paragraph records the discovery; completion evidence is recorded below
when that checkpoint is implemented and tested.

The second checkpoint implements both gates. The trusted runner establishes an
immutable source tag; the server explicitly dispatches the fixed full-validation
workflow. A separate immutable root candidate changes only the IntMed pin and
must pass the existing root browser/combined-build workflow. The server repeats
proof, ref and fresh publication/capability checks before advancing main without
force. A changed main, missing proof or failed/newer pending run blocks progress.
The public manifest and topic hashes are still verified before completion.
Polling reuses existing work and shares a bounded CI wait; an exact already-live
pin is checked rather than automatically declared successful.

Conditional result writes confirm that one active row actually changed before
reporting success. Token consumption is scoped to the presented token, so an old
request cannot consume a replacement. Capability masking now happens before
checkout/environment logging. GitHub requests have bounded headers/body reads;
permission errors retain safe diagnostic codes without provider response bodies.
A final resume retry guard stops stale work before sending a newer account's
profile request.

Synthetic tests reproduced the original source/root CI bypasses before repair.
They cover exact workflow/SHA/repository/reference eligibility, newest-run and
rerun behavior, dispatch visibility, immutable references, altered AUS/other
fields, concurrent main advances, expired/cancelled publication at the write
boundary, zero-row result races, replacement tokens, no-op validation, bounded
waiting, public hash failure and early log masking. No real draft was approved
or published to test this path. Full hosted CI and normal coordinator deployment
remain separate requirements. A later-created workflow run cannot be anticipated;
the newest visible eligible proof is reread after public-byte verification.

Operational limit: the unattended credential must have Contents and Actions
read/write on both selected repositories. This review does not grant or expose
that credential, nor prove its write scopes by touching a real draft. Missing
permission fails closed with a configuration code. Long Actions queue delays may
exhaust the existing publication lifetime and require an explicit retry; no
lease, review decision, model/provider setting or database schema was changed.

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
