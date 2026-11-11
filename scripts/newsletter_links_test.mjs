import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

// Run the real handler with synthetic HTTP boundaries; never contact an email provider.
const id = '11111111-1111-4111-8111-111111111111';
const email = 'admin@example.com';
const endpoint = 'https://test.supabase.co/functions/v1/intmed-newsletter';
const origin = 'https://drgerami-md.ir';
const env = {
  SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
  SUPABASE_ANON_KEY: 'synthetic-anon', RESEND_API_KEY: 'synthetic-provider',
  NEWSLETTER_FROM: 'IntMed <updates@example.com>',
  NEWSLETTER_SIGNING_SECRET: 'synthetic-signing-secret-at-least-32-characters',
};
const profile = {id, email, role: 'admin', approved: true, rejected: false};
let state = {itemState: {
  'newsletter:subscription': {subscribed: true, email},
  topic: {note: 'preserve note'},
}, highlights: {topic: [{id: 'h1', quote: 'preserve highlight'}]}};
let handler, consentWrites = 0, authenticated = true, isAdmin = true;
const mail = [];
const context = vm.createContext({
  Deno: {serve: fn => {handler = fn;}, env: {get: key => env[key]}},
  Response, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob, crypto: webcrypto,
  setTimeout: fn => fn(),
  fetch: async (address, options = {}) => {
    const url = new URL(address), method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (address === 'https://api.resend.com/emails') {
      assert.equal(method, 'POST');
      mail.push(body);
      return Response.json({id: 'synthetic-mail'});
    }
    assert.equal(url.origin, 'https://test.supabase.co', 'Unexpected external request');
    if (url.pathname === '/auth/v1/user') return authenticated ? Response.json({id}) : Response.json({}, {status: 401});
    if (url.pathname === '/auth/v1/admin/users/' + id) {
      return Response.json({email, email_confirmed_at: '2026-11-01T00:00:00Z'});
    }
    if (url.pathname === '/rest/v1/profiles') return Response.json([{...profile, role: isAdmin ? 'admin' : 'user'}]);
    if (url.pathname === '/rest/v1/study_state') {
      if (method === 'PATCH') {
        consentWrites++;
        state = body.state;
      }
      return Response.json([{user_id: id, state, updated_at: '2026-11-01T00:00:00Z'}]);
    }
    if (url.pathname === '/rest/v1/intmed_newsletter_deliveries') {
      if (method === 'POST') return Response.json([body]);
      if (method === 'PATCH') return new Response(null, {status: 204});
      return Response.json([]);
    }
    throw Error('Unexpected endpoint: ' + url.pathname);
  },
});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-newsletter/index.ts', 'utf8'), context);
const post = body => handler(new Request(endpoint, {
  method: 'POST', headers: {Origin: origin, Authorization: 'Bearer synthetic-user'},
  body: JSON.stringify(body),
}));

const preflight = await handler(new Request(endpoint, {method: 'OPTIONS', headers: {Origin: origin}}));
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);

for (const action of ['status', 'send']) {
  assert.equal((await handler(new Request(endpoint, {method: 'POST', headers: {Origin: origin}, body: JSON.stringify({action})}))).status, 401);
  authenticated = false;
  assert.equal((await post({action})).status, 401);
  authenticated = true;
  isAdmin = false;
  assert.equal((await post({action})).status, 403);
  isAdmin = true;
}
assert.equal(mail.length, 0, 'Only an authenticated admin may send mail');

for (const action of ['send', 'test']) {
  const response = await post({action, subject: 'Updates', text: 'New questions', campaignId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sent, 1);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  const message = mail.at(-1);
  assert.deepEqual(message.to, [email]);
  assert.equal(message.subject, action === 'test' ? '[آزمایشی] Updates' : 'Updates');
  assert.ok(message.text.includes('\nIntMed — https://drgerami-md.ir/intmed/\n'), 'Email footer must open the mounted app');
  const link = new URL(message.text.match(/https:\/\/\S+#token=\S+/)[0]);
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, '/intmed/newsletter.html', 'Unsubscribe must open the app confirmation page');
}
assert.equal(mail.length, 2);
const link = new URL(mail[0].text.match(/https:\/\/\S+#token=\S+/)[0]);
const token = new URLSearchParams(link.hash.slice(1)).get('token');
const before = structuredClone(state);
const scanner = await handler(new Request(endpoint + '?action=unsubscribe&token=' + encodeURIComponent(token)));
assert.equal(scanner.status, 403);
assert.deepEqual(state, before, 'GET must never change signed consent');
assert.equal(consentWrites, 0);
assert.equal((await post({action: 'unsubscribe', token: token + 'x'})).status, 400);
assert.equal((await post({action: 'unsubscribe', token: 'invalid'})).status, 400);
const expiredPayload = Buffer.from(JSON.stringify({id, email, exp: 1})).toString('base64url');
const signingKey = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(env.NEWSLETTER_SIGNING_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
const expiredSignature = Buffer.from(await webcrypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(expiredPayload))).toString('base64url');
assert.equal((await post({action: 'unsubscribe', token: expiredPayload + '.' + expiredSignature})).status, 400);
assert.equal(consentWrites, 0, 'Tampered token must never change consent');
assert.equal((await post({action: 'unsubscribe', token})).status, 200);
assert.equal(consentWrites, 1);
assert.equal(state.itemState['newsletter:subscription'].subscribed, false);
assert.deepEqual(state.itemState.topic, before.itemState.topic);
assert.deepEqual(state.highlights, before.highlights);
assert.equal(mail.length, 2, 'Consent requests must never send mail');
console.log('Newsletter links passed: mounted-app send/test links, origin-only CORS, scanner-safe GET, signed consent and notes preserved.');
