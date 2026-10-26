import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let refreshMode = "ok", expired = false, gatewayAttempts = 0;
const calls = [];
const store = new Map();
const tabStore = new Map();
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
  if(url.startsWith("https://intmed.example/api/")) return Promise.reject(new Error("same-origin route unavailable"));
  if(url.startsWith("https://api.drgerami-md.ir")){ gatewayAttempts++; return new Promise(() => {}); }
  if(url.includes("grant_type=refresh_token") && refreshMode === "network") return Promise.reject(new Error("offline"));
  if(url.includes("grant_type=refresh_token") && refreshMode === "invalid") return reply({message:"Invalid refresh"},400);
  if(url.includes("grant_type=refresh_token")) return reply({access_token:"refreshed", refresh_token:"refresh-2", user:{id:userId}});
  if(url.includes("/auth/v1/signup")) return reply({user:{id:"duplicate",identities:[]}});
  if(url.includes("/auth/v1/token")) return reply({access_token:"access", refresh_token:"refresh", user:{id:userId}});
  if(url.includes("/functions/v1/intmed-telegram-bot")) return reply({ok:true});
  if(url.includes("/auth/v1/user")) return reply({id:userId});
  if(url.includes("/rest/v1/profiles?id=eq.") && expired && options.headers.Authorization !== "Bearer refreshed") return reply({message:"Expired"},401);
  if(url.includes("/rest/v1/profiles?id=eq.")) return reply({id:userId, username:"doctor", approved:true, role:"user"});
  if(url.includes("/auth/v1/logout")) return reply(null, 204);
  throw new Error("unexpected test request: " + url);
}

const window = {
  INTMED_CONFIG:{supabaseUrl:"https://api.drgerami-md.ir", supabaseFallbackUrl:"https://example.supabase.co", supabaseAnonKey:"anon", authPrimaryTimeoutMs:20, authFallbackTimeoutMs:50},
  location:{origin:"https://intmed.example", pathname:"/", search:"", hash:""},
  history:{replaceState:() => { window.location.hash = ""; }}
};
const context = vm.createContext({
  window,
  fetch:fetchMock,
  localStorage:{getItem:key => store.get(key) || null, setItem:(key,value) => store.set(key,value), removeItem:key => store.delete(key)},
  sessionStorage:{getItem:key => tabStore.get(key) || null, setItem:(key,value) => tabStore.set(key,value), removeItem:key => tabStore.delete(key)},
  JSON,
  Promise,
  URLSearchParams,
  encodeURIComponent,
  setTimeout,
  clearTimeout,
  AbortController,
  console
});
vm.runInContext(fs.readFileSync(new URL("../docs/js/intmed-backend.js", import.meta.url), "utf8"), context);

assert.equal(window.IntMedBackend.isConfigured(), true);
const result = await window.IntMedBackend.signIn("doctor@example.com", "correct horse battery staple");
assert.equal(result.session.user.id, userId);
assert.ok(gatewayAttempts > 0);
assert.ok(calls.some(call => call.url.startsWith("https://example.supabase.co/auth/v1/token")));
assert.equal(window.IntMedBackend.session().access_token, "access");
const profileCall = calls.find(call => call.url.includes("/rest/v1/profiles"));
assert.equal(profileCall.options.headers.Authorization, "Bearer access");
await window.IntMedBackend.signOut();
assert.equal(window.IntMedBackend.session(), null);
await assert.rejects(window.IntMedBackend.signUp("doctor@example.com", "password123", {}), error => error.code === "duplicate_email" && error.message === "این ایمیل قبلاً ثبت شده است.");
window.location.hash = "#type=recovery&access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600";
assert.equal(window.IntMedBackend.captureRecoverySession(), true);
assert.equal(window.IntMedBackend.session().recovery, true);
await window.IntMedBackend.updatePassword("a-new-secure-password");
const passwordCall = calls.find(call => call.url.includes("/auth/v1/user"));
assert.equal(passwordCall.options.headers.Authorization, "Bearer recovery-access");
window.location.hash = "#type=invite&access_token=invite-access&refresh_token=invite-refresh&expires_in=3600";
assert.equal(window.IntMedBackend.captureRecoverySession(), true);
assert.equal(window.IntMedBackend.session().flow_type, "invite");
console.log("private backend unit test passed: sign-in, approval, bearer auth, sign-out, password recovery, invite setup");

await window.IntMedBackend.signIn("doctor@example.com", "password");
expired=true;refreshMode="network";
await assert.rejects(window.IntMedBackend.profile(), /offline/);
assert.equal(window.IntMedBackend.session().refresh_token,"refresh");
refreshMode="ok";
await window.IntMedBackend.profile();
assert.equal(window.IntMedBackend.session().access_token,"refreshed");
tabStore.set("intmed_supabase_session",JSON.stringify({access_token:"expired",refresh_token:"revoked",user:{id:userId}}));
refreshMode="invalid";
await assert.rejects(window.IntMedBackend.profile(), /auth/);
assert.equal(window.IntMedBackend.session(),null);
console.log("Session regression passed: automatic refresh, offline session retained, rejected refresh requires login.");

let wafFallbackCalls=0;
const wafStore=new Map(),wafTabStore=new Map(),wafWindow={
  INTMED_CONFIG:{supabaseUrl:"https://api.drgerami-md.ir",supabaseFallbackUrl:"https://example.supabase.co",supabaseAnonKey:"anon",authPrimaryTimeoutMs:20,authFallbackTimeoutMs:50},
  location:{origin:"https://intmed.example",pathname:"/",search:"",hash:""}
};
const wafContext=vm.createContext({window:wafWindow,fetch:(url)=>{
  if(url.startsWith("https://intmed.example/api/"))return Promise.reject(new Error("same-origin route unavailable"));
  if(url.startsWith("https://api.drgerami-md.ir"))return reply({message:"Cloudflare access denied"},403);
  wafFallbackCalls++;
  if(url.includes("/auth/v1/token"))return reply({access_token:"waf-access",refresh_token:"waf-refresh",user:{id:userId}});
  if(url.includes("/rest/v1/profiles"))return reply({id:userId,username:"doctor",approved:true,role:"user"});
  if(url.includes("/functions/v1/intmed-telegram-bot"))return reply({ok:true});
  throw Error("unexpected WAF fallback request: "+url);
},localStorage:{getItem:key=>wafStore.get(key)||null,setItem:(key,value)=>wafStore.set(key,value),removeItem:key=>wafStore.delete(key)},sessionStorage:{getItem:key=>wafTabStore.get(key)||null,setItem:(key,value)=>wafTabStore.set(key,value),removeItem:key=>wafTabStore.delete(key)},JSON,Promise,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,AbortController,console});
vm.runInContext(fs.readFileSync(new URL("../docs/js/intmed-backend.js",import.meta.url),"utf8"),wafContext);
assert.equal((await wafWindow.IntMedBackend.signIn("doctor@example.com","password")).session.access_token,"waf-access");
assert.ok(wafFallbackCalls>=2,"403 gateway response did not fall back to the direct project origin");
console.log("Gateway regression passed: CDN/WAF 403 falls back to the direct secure origin.");
