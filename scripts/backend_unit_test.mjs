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

const patchStore=new Map([["intmed_supabase_session",JSON.stringify({access_token:"patch-access",refresh_token:"patch-refresh",user:{id:userId}})]]),patchTabStore=new Map(),patchCalls=[];
const patchWindow={INTMED_CONFIG:{supabaseUrl:"https://api.drgerami-md.ir",supabaseFallbackUrl:"https://example.supabase.co",supabaseAnonKey:"anon",authPrimaryTimeoutMs:20,authFallbackTimeoutMs:50}};
const patchContext=vm.createContext({window:patchWindow,fetch:(url,options={})=>{patchCalls.push({url,options});if(url.startsWith("https://api.drgerami-md.ir")&&options.method==="PATCH")return reply({message:"Method not allowed"},405);if(url.includes("/study_state")&&options.method==="PATCH")return reply([{state:{},updated_at:"2026-10-29T00:00:01Z"}]);if(url.includes("/study_state"))return reply([{state:{},updated_at:"2026-10-29T00:00:00Z"}]);if(url.includes("/profiles"))return reply([{id:userId,approved:true,role:"user"}]);if(url.includes("/tickets"))return reply([]);if(url.includes("/functions/v1/intmed-telegram-bot"))return reply({ok:true});throw Error("unexpected PATCH fallback request: "+url);},localStorage:{getItem:key=>patchStore.get(key)||null,setItem:(key,value)=>patchStore.set(key,value),removeItem:key=>patchStore.delete(key)},sessionStorage:{getItem:key=>patchTabStore.get(key)||null,setItem:(key,value)=>patchTabStore.set(key,value),removeItem:key=>patchTabStore.delete(key)},JSON,Promise,Set,Date,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,AbortController,console});
vm.runInContext(fs.readFileSync(new URL("../docs/js/intmed-backend.js",import.meta.url),"utf8"),patchContext);
const patchState=await patchWindow.IntMedBackend.loadLegacyState();patchState.users[userId].itemState.note={note:"persist"};await patchWindow.IntMedBackend.saveLegacyState(patchState);
assert.ok(patchCalls.some(call=>call.url.startsWith("https://api.drgerami-md.ir")&&call.options.method==="PATCH"));
assert.ok(patchCalls.some(call=>call.url.startsWith("https://example.supabase.co")&&call.options.method==="PATCH"));
console.log("Synchronization regression passed: gateway PATCH 405 falls back and preserves highlights/state.");

const readonlyStore=new Map(),readonlyTabStore=new Map(),readonlyWindow={
  INTMED_CONFIG:{supabaseUrl:"https://api.drgerami-md.ir",supabaseFallbackUrl:"https://example.supabase.co",supabaseAnonKey:"anon",authPrimaryTimeoutMs:20,authFallbackTimeoutMs:50},
  location:{origin:"https://intmed.example",pathname:"/",search:"",hash:""}
};
const readonlyNetworkError=Object.create(null,{message:{get:()=>"Failed to fetch"},code:{get:()=>"network_failure"}});
const readonlyContext=vm.createContext({window:readonlyWindow,fetch:()=>Promise.reject(readonlyNetworkError),localStorage:{getItem:key=>readonlyStore.get(key)||null,setItem:(key,value)=>readonlyStore.set(key,value),removeItem:key=>readonlyStore.delete(key)},sessionStorage:{getItem:key=>readonlyTabStore.get(key)||null,setItem:(key,value)=>readonlyTabStore.set(key,value),removeItem:key=>readonlyTabStore.delete(key)},JSON,Promise,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,AbortController,console});
vm.runInContext(fs.readFileSync(new URL("../docs/js/intmed-backend.js",import.meta.url),"utf8"),readonlyContext);
await assert.rejects(readonlyWindow.IntMedBackend.signUp("doctor@example.com","password123",{}),error=>error.message.includes("مسیرهای امن ثبت‌نام")&&!error.message.includes("only a getter"));
console.log("Registration regression passed: read-only browser network errors are translated safely.");

// Headers alone are not a completed response: a stalled response body must
// exhaust the same deadline and permit the secure fallback to run.
function deadlineBackend(fetchImpl, savedSession){
  function storage(initial){const values=new Map(initial||[]);return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
  const deadlineWindow={INTMED_CONFIG:{supabaseUrl:"https://primary.test",supabaseFallbackUrl:"https://fallback.test",supabaseAnonKey:"public",authPrimaryTimeoutMs:20,authFallbackTimeoutMs:30}};
  vm.runInNewContext(fs.readFileSync(new URL("../docs/js/intmed-backend.js",import.meta.url),"utf8"),{window:deadlineWindow,fetch:fetchImpl,localStorage:storage(),sessionStorage:storage(savedSession?[["intmed_supabase_session",JSON.stringify(savedSession)]]:[]),JSON,Promise,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,AbortController,console});
  return deadlineWindow.IntMedBackend;
}
async function bounded(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("test guard expired: backend response never settled")),300);})]);}
  finally{clearTimeout(timer);}
}
const stalledBody={ok:true,status:200,text:()=>new Promise(()=>{})};
const bodyCalls=[];
const bodyBackend=deadlineBackend((url,options)=>{
  bodyCalls.push({url,signal:options.signal});
  return url.startsWith("https://primary.test")?Promise.resolve(stalledBody):reply({version:"healthy"});
});
assert.equal((await bounded(bodyBackend.checkAuthConnection())).version,"healthy");
assert.equal(bodyCalls[0].signal.aborted,true,"body timeout must abort the incomplete response");
await bounded(bodyBackend.checkAuthConnection());
assert.equal(bodyCalls.at(-1).url,"https://fallback.test/auth/v1/health","only a completed healthy route becomes preferred");
const allBodiesStalled=deadlineBackend(()=>Promise.resolve(stalledBody));
await assert.rejects(bounded(allBodiesStalled.checkAuthConnection()),error=>error.code==="network_timeout");

let refreshRequests=0;
const staleBodyBackend=deadlineBackend(url=>{
  if(url.includes("grant_type=refresh_token")){refreshRequests++;return reply({access_token:"renewed",refresh_token:"renewed-refresh",user:{id:userId}});}
  if(url.startsWith("https://primary.test"))return Promise.resolve({ok:false,status:401,text:()=>new Promise(()=>{})});
  return reply({id:userId,approved:true,role:"user"});
},{access_token:"existing",refresh_token:"existing-refresh",user:{id:userId}});
assert.equal((await bounded(staleBodyBackend.profile())).id,userId);
assert.equal(refreshRequests,0,"a partial 401 must time out, not deadlock token refresh");

let rejectedLoginRequests=0;
const badPasswordBackend=deadlineBackend((url,options)=>{if(options.method==='POST')rejectedLoginRequests++;return reply({message:"Invalid login credentials"},400);});
await assert.rejects(bounded(badPasswordBackend.signIn("doctor@example.test","bad-password")),error=>error.status===400);
assert.equal(rejectedLoginRequests,1,"completed credential rejection must not replay login against another origin");
const emptyBackend=deadlineBackend(()=>Promise.resolve({ok:true,status:204,text:()=>{throw Error("204 body must not be consumed");}}));
assert.equal(await bounded(emptyBackend.checkAuthConnection()),null);
const portalBackend=deadlineBackend(url=>url.startsWith("https://primary.test")?Promise.resolve({ok:true,status:200,text:async()=>"<html>Network sign-in required</html>"}):reply({version:"json-service"}));
assert.equal(((await bounded(portalBackend.checkAuthConnection()))||{}).version,"json-service","an HTML 200 is not a usable backend response");
console.log("Body deadline regression passed: stalled success/401 bodies fall back, all routes terminate, definitive errors and 204 semantics are retained.");
