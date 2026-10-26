import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('backend/cloudflare/intmed-api-proxy.js', 'utf8');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'never-forward=this' },
  });
};
const worker = (await import(moduleUrl)).default;
const allowed = await worker.fetch(new Request('https://api.drgerami-md.ir/auth/v1/health', {
  headers: { Origin: 'https://drgerami-md.ir', apikey: 'public-test' },
}));
assert.equal(allowed.status, 200);
assert.equal(calls[0].url, 'https://upwbktvnybsjugdegjji.supabase.co/auth/v1/health');
assert.equal(calls[0].options.headers.get('apikey'), 'public-test');
assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://drgerami-md.ir');
assert.equal(allowed.headers.get('Set-Cookie'), null);
assert.equal((await worker.fetch(new Request('https://api.drgerami-md.ir/auth/v1/health', {
  headers: { Origin: 'https://evil.example' },
}))).status, 403);
assert.equal((await worker.fetch(new Request('https://api.drgerami-md.ir/anything-else', {
  headers: { Origin: 'https://drgerami-md.ir' },
}))).status, 404);
assert.equal((await worker.fetch(new Request('https://api.drgerami-md.ir/rest/v1/profiles', {
  method: 'OPTIONS', headers: { Origin: 'https://drgerami-md.ir' },
}))).status, 204);
const sameOrigin = await worker.fetch(new Request('https://drgerami-md.ir/api/auth/v1/health', {
  headers: { Origin: 'https://drgerami-md.ir', apikey: 'public-test' },
}));
assert.equal(sameOrigin.status, 200);
assert.equal(calls[1].url, 'https://upwbktvnybsjugdegjji.supabase.co/auth/v1/health');
assert.equal(calls.length, 2);
console.log('Cloudflare proxy passed: fixed upstream, same-origin mobile route, restricted paths, CORS, no cookies or open proxy.');
