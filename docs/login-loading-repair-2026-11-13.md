# Login and content-loading recovery — 2026-11-13

The reported mobile login message is the network-failure branch, not proof of
an incorrect password. Investigation found reproducible client defects and
retained the existing private authentication/approval and state isolation model.

## Reproduced causes

- A topic fetch or JSON body can remain pending indefinitely. Its shared promise
  then blocks every later open of the same topic. Library and search requests
  had similar unbounded waits.
- Opening a lesson waited for cross-topic images referenced only by MCQ/KF
  questions. A stalled unrelated chapter could therefore hide a ready lesson.
- A successfully selected API route was forgotten on the post-login reload.
  That forced another attempt through a previously failing gateway.
- The short route-selection deadline also cut off a reachable username-login
  function while it was still processing server round trips. A synthetic slow,
  valid login reproduces the reported network-error branch.
- A completed HTTP 5xx public-content response hid an existing successful cache
  entry; cache fallback handled only thrown errors/timeouts.

Read-only live checks confirmed the direct Auth health endpoint and login
preflight were reachable from this executor. The deployed login function matched
the source and the configured gateway Worker was present. Aggregate service
timings were inspected without reading user profiles, passwords or study notes.
These observations do not measure the user's specific mobile-network latency.
No production password login or notification was triggered for diagnosis.

## Repair

Before exchanging a password, bounded anonymous health GETs select a responsive
configured API route. A second health probe starts after 200 ms if needed;
passwords and refresh tokens are never raced as part of discovery. A confirmed
route gets up to 20 seconds for password processing, independently of the short
route-selection deadline. A manual retry redoes discovery if the network changes.
Successful route metadata is remembered in sessionStorage for five minutes
across reloads, and accepted only if it still exactly matches a configured URL.
It grants no access and stores no password, JWT, profile or approval decision.
The existing profile check, definitive credential/rate-limit errors and private
save protections remain in place.

Topic, search and library requests now bound the full JSON response with the
existing nine-second public-content deadline. Failed in-flight entries are
released, with inline retry for a topic/viewer and recoverable later library or
search attempts. Lesson/table/image opens do not wait for question-only image
dependencies; question and exam paths still load their required image topics.
The public service worker uses an exact successful cached URL on HTTP 5xx;
different version hashes and definitive 404s remain distinct. Private API
requests never enter this cache.

No DNS/host/mount, Supabase schema, RLS, user account or medical content changes
are part of this repair. Existing source chapters and generated content hashes
are preserved; script URLs are versioned through the normal pipeline.

## Verification

- Observed failing tests before the fixes: slow valid authentication, route
  recovery after a network change, eight topic/search/library browser scenarios,
  and successful public-cache fallback on 5xx.
- Regression coverage: `auth_route_recovery_test.mjs`, mobile
  `auth_route_browser_test.mjs`, `content_loading_browser_test.mjs`, existing
  backend/session/state, PWA, browser, library and exam tests.
- The new tests run in the ordinary validation workflow. Full source CI and
  root-site browser/combined-build gates must pass before advancing the exact
  host pin; publication is verified against Cloudflare's active deployment.
- Local `security_hardening_test.mjs` could not start because PGlite is absent
  in this executor. The hosted validation workflow installs that dependency
  and runs this check; local results alone do not establish its outcome.

The mobile browser fixture uses intercepted requests and a synthetic account;
it establishes client recovery behavior without claiming an end-to-end test of
the owner's iPhone, cellular provider or live account.
