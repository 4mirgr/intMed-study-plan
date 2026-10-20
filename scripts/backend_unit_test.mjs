import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const calls = [];
const store = new Map();
const userId = "11111111-1111-4111-8111-111111111111";
function reply(body, status = 200){
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body == null ? "" : JSON.stringify(body))
  });
}
function fetchMock(url, options = {}){
  calls.push({url, options});
  if(url.includes("grant_type=refresh_token")) return reply({access_token:"refreshed", refresh_token:"refresh-2", user:{id:userId}});
  if(url.includes("/auth/v1/token")) return reply({access_token:"access", refresh_token:"refresh", user:{id:userId}});
  if(url.includes("/auth/v1/user")) return reply({id:userId});
  if(url.includes("/rest/v1/profiles?id=eq.")) return reply({id:userId, username:"doctor", approved:true, role:"user"});
  if(url.includes("/auth/v1/logout")) return reply(null, 204);
  throw new Error("unexpected test request: " + url);
}

const window = {
  INTMED_CONFIG:{supabaseUrl:"https://example.supabase.co", supabaseAnonKey:"anon"},
  location:{origin:"https://intmed.example", pathname:"/", search:"", hash:""},
  history:{replaceState:() => { window.location.hash = ""; }}
};
const context = vm.createContext({
  window,
  fetch:fetchMock,
  localStorage:{getItem:key => store.get(key) || null, setItem:(key,value) => store.set(key,value), removeItem:key => store.delete(key)},
  JSON,
  Promise,
  URLSearchParams,
  encodeURIComponent,
  console
});
vm.runInContext(fs.readFileSync(new URL("../docs/js/intmed-backend.js", import.meta.url), "utf8"), context);

assert.equal(window.IntMedBackend.isConfigured(), true);
const result = await window.IntMedBackend.signIn("doctor@example.com", "correct horse battery staple");
assert.equal(result.session.user.id, userId);
assert.equal(window.IntMedBackend.session().access_token, "access");
const profileCall = calls.find(call => call.url.includes("/rest/v1/profiles"));
assert.equal(profileCall.options.headers.Authorization, "Bearer access");
await window.IntMedBackend.signOut();
assert.equal(window.IntMedBackend.session(), null);
window.location.hash = "#type=recovery&access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600";
assert.equal(window.IntMedBackend.captureRecoverySession(), true);
assert.equal(window.IntMedBackend.session().recovery, true);
await window.IntMedBackend.updatePassword("a-new-secure-password");
const passwordCall = calls.find(call => call.url.includes("/auth/v1/user"));
assert.equal(passwordCall.options.headers.Authorization, "Bearer recovery-access");
console.log("private backend unit test passed: sign-in, approval, bearer auth, sign-out, password recovery");
