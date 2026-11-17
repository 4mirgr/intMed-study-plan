# Background publication

Owner-approved workflow, 2026-11-05 (Tehran): one explicit publication confirmation queues the
reviewed draft in Supabase and closes its dialog. It does not immediately mean the content is live.
The manager's queue polls server statuses every eight seconds without changing another open draft.
Closing the page or the laptop does not terminate GitHub's publisher.

## Exact-release validation contract — 2026-11-17

The current publisher must validate both repositories before changing production:

1. The trusted runner pushes the integrated source commit and an immutable
   `intmed-release-check-<full SHA>` lightweight tag using its existing GitHub
   Actions Contents-write permission. An existing tag must resolve to that SHA;
   it is never moved or force-pushed.
2. The capability-scoped server verifies the active publication, branch ancestry,
   topic manifest and tag. It explicitly dispatches `validate-and-deploy.yml`
   against that fixed tag: pushes made with `GITHUB_TOKEN` do not normally start
   another push workflow. Status polling never dispatches work.
3. After source CI passes, the server prepares an immutable root candidate from
   the fresh `gerami-website/main`. Its only change is `intmed.commit` in
   `deploy/projects.json`; AUS, mounts, repositories and all other fields remain
   equal to the base. The existing `site-checks.yml` runs its browser checks and
   combined Cloudflare build on that exact candidate.
4. Before deployment, the server independently rechecks both fixed workflows and
   the candidate/ref contract. It advances main without force only if main still
   equals the base (or the exact already-applied candidate), then rereads main.
   GitHub's ref API has no expected-old-SHA parameter: the fresh read plus
   non-fast-forward rejection prevents overwriting ordinary concurrent advances.
   A different main requires a fresh candidate and validation.
5. The runner verifies both mounted public manifest and topic bytes, waits for
   any visible redundant main-push validation, and submits success. The server repeats
   the validation/current-main checks before recording `published` or consuming
   its capability. A conditional row write must confirm an active publication
   changed; consumption targets the exact presented capability. No caller-supplied
   success flag substitutes for proof.

Only the newest eligible exact-SHA run of each fixed workflow counts; PR/fork,
wrong-repository and other-workflow runs cannot satisfy the gate. Newer pending,
cancelled or failed runs block an older success. A dispatch visibility floor
avoids confusing an old failed run with the newly requested run. Exact-current
host pins still require root CI; a newer/different pin is not implicit success.

CI waits share a 12-minute budget; public byte verification keeps its separate
eight-minute limit. The workflow allows 30 minutes, within the existing 35-minute
abandonment and 45-minute capability limits. Queued, missing-permission, failed or
timed-out work remains recoverable as an error; no educational content or review
decision is discarded. Immutable validation references are retained for audit.

The server credential needs selected-repository Contents read/write **and Actions
read/write in both repositories**. Root workflow dispatch is an additional
permission requirement. Missing permission must produce a configuration error;
it must never fall back to changing production without checks. The trusted
runner's `GITHUB_TOKEN` is not sent to the browser or Supabase.

Capability masking runs before checkout and before any environment-bearing
publication step. It reads only the built-in event file; secret values are not
interpolated into the shell script or exposed in the mask step's environment.
HTTP failures retain allowlisted diagnostic codes, never raw provider bodies.

These gates prove tested code/builds. They do not independently approve clinical
claims or attest arbitrary source commits against reviewed draft text. Existing
review, privacy and provenance boundaries still apply.

## Execution and recovery

`claim_intmed_publication()` is a service-role-only, invoker RPC. A transaction advisory lock selects
the oldest `publish_requested` row only when no publisher is active. The capability is minted only
for the selected row, so waiting drafts do not expire while waiting for other releases.

GitHub concurrency is per draft, not global: a global concurrency group can replace older pending
runs rather than act as a FIFO. The database now serializes canonical integration. Completion wakes
the next request. The existing private five-minute sweep also drains the queue, independently of
model-provider backoff. Neither queue recovery nor publication invokes a language model.

Dispatch errors and cloud work abandoned for 35 minutes become visible `publish_error` rows. They
retain the draft/review decision; a reviewer retries explicitly. Recovery never approves new data.

## Actual hosting bridge

Historical implementation, before the exact-release contract above. Retained to
explain the original bridge and observed permission problem; direct main writes
are superseded by the tested-candidate path.

After pushing the canonical/generated content, the trusted workflow calls the capability-scoped
`deploy` action of `intmed-content-publisher`. The GitHub credential stays in Supabase; it is not
sent to the browser or workflow. The server verifies source-branch ancestry and the topic manifest,
then changes only `intmed.commit` in `4mirgr/gerami-website/deploy/projects.json` on `main`, using
the current file SHA. AUS and every unrelated pin/field are preserved. Divergence/rollback is refused.
The workflow reports `published` only after the mounted public manifest AND topic bytes match.

Observed live on 2026-11-05: Cloudflare Browser Integrity Check blocked the default
`Python-urllib/3.11` public verifier (firewall source/rule `bic`). Public read requests now identify
the legitimate client as `IntMed-Publisher/1.0` and request JSON explicitly. No firewall/authentication
rule was disabled. The read-only production diagnostic exercises the same Python verifier; errors
report HTTP phase/status or hash mismatch without logging response bodies or capabilities.

The existing `INTMED_GITHUB_ACTIONS_TOKEN` needs selected-repository access to both
`4mirgr/intMed-study-plan` and `4mirgr/gerami-website`, with Contents read/write; Actions write is
needed for dispatching the study workflow. Public repository read success does NOT establish write
permission. Missing host permission is reported as `hosting_permission_required` without exposing
the credential. Configure/replace credentials only in Supabase Secrets, never in public source/chat.
The live key was verified to lack host Contents write on this date; the owner must add the selected
`gerami-website` repository. Coordinator-driven code releases can still update the host through the
connected GitHub integration, but that does not grant the unattended publisher the same permission.

## Deployment

1. Run publisher, queue/sweep SQL and review-browser tests, then normal CI.
2. Apply `content_publication_queue.sql` and the updated private `request_sweep()` definition from
   `content_queue_sweep.sql`; no user table or source content migration is required.
3. Deploy `intmed-content-publisher` and `intmed-content-sweep` preserving their handler auth.
4. Deploy the UI and worker script through the normal exact host pin update.
5. Confirm one already-approved request reaches its public topic; never test by approving another
   user's draft or bypassing clinical/provenance gates.

Do not reapply `content_review.sql` without restoring `cloud_content_publish.sql` afterward:
the legacy local publication claimant must remain disabled to prevent competing writers.
