# IntMed security assessment — 2026-10-21

This is a scoped configuration/code review with non-destructive anonymous probes, not a
penetration test or a guarantee that the system cannot be compromised. No real user rows,
credentials, or account mutations were used. Authenticated production RLS and cloud security
settings could not be inspected with the available repository-only access.

## Observed on the public deployment

- Anonymous `profiles`, `study_state`, and `tickets` REST reads (one identifier column,
  limit=1) returned HTTP 401. No private rows were obtained.
- The public educational `content/topics/cardio-ecg.json` returned HTTP 200 without login.
  Educational JSON includes answer keys, and original images/modules have static URLs.
- `intmed-login` OPTIONS returned 204. `intmed-signup-notify` and `intmed-newsletter`
  OPTIONS returned 404: those optional functions were not deployed at review time.
- A pattern scan of the current published text found the expected public anon JWT and no
  service-role JWT or matching private GitHub/Supabase-secret token pattern. This is not a
  full secret scan of Git history. Repository branch-protection/security-analysis settings
  were inaccessible to the connected integration and were not verified.
- HTTPS worked. Responses did not include CSP, HSTS, X-Frame-Options or X-Content-Type-Options
  headers. GitHub Pages does not provide project-defined response headers.

## Applied in the website code

- A restrictive **meta CSP** on the main app: self-hosted scripts, no unsafe-eval or inline
  script execution; backend connections restricted to this Supabase project; self-hosted
  frames/fonts, no plugins/base URL overrides. Inline CSS remains allowed because the
  current app uses dynamic styles. This does not replace HTTP-only directives such as
  `frame-ancestors` and HSTS and is not a complete XSS defense.
- Study attempts/responses use independent private state keys. Starting again preserves
  older attempts. Notes/highlights are not cleared. CAS merges preserve independent device
  updates and the first recorded response for a question in a particular attempt.
- Manager-only controls continue to enforce the server-side Supabase role. A hidden panel,
  JavaScript role variable, public anon key, or private repository is not access control.

## Prepared database hardening — owner installation still required

`backend/supabase/security_hardening.sql` tightens the existing study-state policies:
admins may read members' data for the requested analytics/PDF, but browser writes are owner-only.
A rejected admin is excluded from `is_intmed_admin`. No account or study data is rewritten.
The previous schema allowed admin writes to another member's state; the browser adapter
already avoided those writes, but the RLS layer should enforce this too.
`setup_services.sql` includes this patch, the email-protection upgrade and optional service
SQL in one additive install; it does not rename an owner or change passwords.

## Content protection: next architectural step

A public static file can be downloaded regardless of whether the visible page asks for login.
Making the repository private protects repository browsing, not published assets. Disabling
selection/right-click or obfuscating JavaScript cannot prevent copying or screenshots.

For restricted educational content, retain the public shell but move protected JSON, images
and modules to private Supabase Storage (or an equivalent private store). Require an approved
Auth identity at the content endpoint and issue short-lived signed URLs. Keep answer keys
on the server for exams that must resist answer inspection. Configure per-user request
limits/audit logs at the content gateway. An optional user watermark deters redistribution;
it does not prevent screenshots or copying by an authorized member.

Do **not** flip the existing content bucket/public URLs or repository visibility before a
verified migration: that would break the published lessons. This storage/gateway migration
has not been executed in this change because it requires private cloud provisioning and a
controlled content migration. Private GitHub Pages also requires a supported GitHub plan;
alternative hosting should be verified before switching.

## Operational actions before an Android release

1. Install the reviewed SQL hardening; verify real approved, pending, suspended and admin
   accounts against RLS. Protect GitHub, Supabase and the manager mailbox with MFA/passkeys.
2. Keep every service key/bot token/signing key in server Secrets. Rotate any secret that
   was ever published; repository privacy cannot revoke copies from old commits or forks.
3. Put protected content behind the approved-user gateway and complete a staged migration.
4. Use hosting/reverse proxy response headers for CSP frame-ancestors, HSTS, nosniff and
   permissions policy. Add request limits, backups with a restore drill, and alerts for
   auth failures or abnormal content downloads. None is claimed active without cloud checks.
5. Android should reuse the same Auth/API authorization, store session tokens using secure
   platform storage, contain no service-role/provider secrets, and avoid allowing arbitrary
   external navigation in a WebView. An APK does not hide bundled content or answer keys.
6. Have an independent authenticated security review before paid/public Android rollout.
