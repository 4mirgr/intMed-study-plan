# Installed Pages.dev PWA login — 2026-11-14

The owner confirmed the installed app starts at
`https://gerami-website.pages.dev/intmed/`. The relative manifest retains that
origin; closing/reopening an installed PWA does not migrate it to `.ir`.

## Confirmed cause

Before the repair, live `OPTIONS` against `intmed-login` returned 204 but
`Access-Control-Allow-Origin: https://drgerami-md.ir` for a Pages.dev caller.
The gateway separately rejected that caller. A browser therefore cannot complete
the JSON login request or read its result and reports a network error. The
previous canonical-domain and simulated-timeout checks did not cover this
installation origin. Five aggregate POST403 entries were also observed, but
their caller origins were not recorded; they are not attributed to the owner.

## Repair and boundaries

- Both login and gateway accept the four exact owned public origins: canonical
  `.ir`, `www`, `4mirgr.github.io`, and `gerami-website.pages.dev`. No wildcard,
  arbitrary preview subdomain or opaque `null` origin is accepted.
- For the two owned aliases only, the verified gateway forwards canonical
  `.ir` Origin upstream while returning the actual browser origin in CORS.
  This keeps existing origin-gated functions usable without weakening their
  JWT, profile, role, method, path or size checks. Originless callers retain
  their previous behavior. Keys and user JWTs are passed unchanged.
- Login rejection telemetry records only an event and a sanitized origin;
  no username, password, JWT, account details, query or body is logged.
- A collapsed, failure-only local support report provides app location without
  query/hash, PWA/network hints, actual backend-script version and recognized
  error code/status. Copying it sends no diagnostic upload or new request.
- No DNS, Worker route, app mount, account, session policy, database schema or
  medical-content change is needed. The server repair reaches existing installs;
  clearing app data or reinstalling is not required for this origin correction.

## Evidence

The exact-origin tests failed before repair and pass afterward, including
malicious/suffix/preview/null denials and unchanged JWT forwarding. Direct live
checks now echo Pages.dev correctly and return readable 401 for empty JSON.
Empty JSON is rejected before rate limits, username lookup or Auth; it is not a
real account login and sends no notification.

Supabase `intmed-login` advanced from v9 to v10 with its existing `verify_jwt:false`
setting retained (password login performs its own authentication). The gateway
retains its compatibility date, empty bindings and enabled observability.

Production diagnostics now check all four origins against gateway/direct
endpoints and exercise actual Pages.dev cross-origin requests in Chromium and
WebKit. They use no credentials or private account data. Normal CI additionally
covers safe support-report redaction and the existing authentication/state gates.
Actual owner password acceptance remains an on-device confirmation, not inferred
from an empty-request or simulated-account test.
