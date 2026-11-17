import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('docs/js/intmed-backend.js','utf8');
const key='intmed_supabase_session';
const A={access_token:'expired-A',refresh_token:'refresh-A',user:{id:'user-A'}};
const B={access_token:'access-B',refresh_token:'refresh-B',user:{id:'user-B'}};
const renewedA={...A,access_token:'renewed-A',refresh_token:'renewed-refresh-A'};
const renewedB={...B,access_token:'renewed-B',refresh_token:'renewed-refresh-B'};
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};}
function response(body,status=200){return {status,ok:status>=200&&status<300,text:async()=>body==null?'':JSON.stringify(body)};}
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function fixture(){
 const tab=storage(),local=storage(),calls=[],refreshStarted=deferred(),refreshReply=deferred(),logoutStarted=deferred(),logoutReply=deferred(),profileStarted=deferred(),profileReply=deferred();
 tab.setItem(key,JSON.stringify(A));
 const state={holdLogout:false,holdInitialProfile:false,bExpired:false,bRefreshCalls:0,bRefreshStarted:deferred(),bRefreshReply:deferred()};
 const window={INTMED_CONFIG:{supabaseUrl:'https://service.test',supabaseAnonKey:'public',authFallbackTimeoutMs:1000}};
 const fetch=async(url,options={})=>{
  calls.push({url,authorization:options.headers?.Authorization,body:options.body});
  if(url.includes('grant_type=refresh_token')){
   const refresh=JSON.parse(options.body).refresh_token;
   if(refresh==='refresh-A'){refreshStarted.resolve();return refreshReply.promise;}
   assert.equal(refresh,'refresh-B');state.bRefreshCalls++;state.bRefreshStarted.resolve();return state.bRefreshReply.promise;
  }
  if(url.includes('grant_type=password'))return response(B);
  if(url.includes('/auth/v1/logout')){logoutStarted.resolve();return state.holdLogout?logoutReply.promise:response(null,204);}
  if(url.includes('/auth/v1/user'))return options.headers.Authorization==='Bearer expired-A'?response({message:'Expired recovery access'},401):response({updated:true});
  if(url.includes('/profiles')){
   const token=options.headers.Authorization;
   if(token==='Bearer expired-A'){
    profileStarted.resolve();return state.holdInitialProfile?profileReply.promise:response({message:'Expired A'},401);
   }
   if(token==='Bearer access-B'&&state.bExpired)return response({message:'Expired B'},401);
   const id=token==='Bearer renewed-A'?'user-A':'user-B';return response({id,approved:true,rejected:false,role:'user'});
  }
  if(url.includes('/functions/v1/intmed-telegram-bot'))return response({ok:true});
  throw Error('Unexpected synthetic request '+url);
 };
 vm.runInNewContext(source,{window,fetch,localStorage:local,sessionStorage:tab,AbortController,setTimeout,clearTimeout,URLSearchParams,console});
 return {backend:window.IntMedBackend,tab,calls,state,refreshStarted,refreshReply,logoutStarted,logoutReply,profileStarted,profileReply};
}
const settle=promise=>promise.then(value=>({value}),error=>({error}));
const stale=result=>assert.match(result.error?.message||'',/^auth$/,'a stale operation must reject instead of succeeding in a new session');

// An old successful refresh cannot bring a signed-out account back.
{
 const f=fixture(),pending=settle(f.backend.profile());await f.refreshStarted.promise;
 await f.backend.signOut();assert.equal(f.backend.session(),null);
 f.refreshReply.resolve(response(renewedA));stale(await pending);
 assert.equal(f.backend.session(),null,'logout must remain effective after the old refresh finishes');
}
// Both successful and definitively rejected refreshes must leave a newer login intact.
for(const status of [200,400,403]){
 const f=fixture(),pending=settle(f.backend.profile());await f.refreshStarted.promise;
 assert.equal((await f.backend.signIn('b@example.test','synthetic-password')).session.user.id,'user-B');
 f.refreshReply.resolve(status===200?response(renewedA):response({message:'Rejected old refresh'},status));
 stale(await pending);assert.equal(f.backend.session().user.id,'user-B');
 assert.ok(!f.calls.some(c=>c.url.includes('profiles?id=eq.user-A')&&c.authorization==='Bearer access-B'),'old account request must never retry with the new account token');
}
// Clearing local auth cannot wait for a network logout; its delayed completion cannot erase B.
{
 const f=fixture();f.state.holdLogout=true;
 const logout=f.backend.signOut();await f.logoutStarted.promise;
 assert.equal(f.backend.session(),null,'local logout must be immediate');
 await f.backend.signIn('b@example.test','synthetic-password');
 f.logoutReply.resolve(response(null,204));await logout;
 assert.equal(f.backend.session().user.id,'user-B','old logout completion must not clear the newer account');
}
// A response from A arriving after B must not start a refresh or repeat A's URL as B.
{
 const f=fixture();f.state.holdInitialProfile=true;
 const pending=settle(f.backend.profile());await f.profileStarted.promise;
 await f.backend.signIn('b@example.test','synthetic-password');
 f.profileReply.resolve(response({message:'Expired A'},401));stale(await pending);
 assert.equal(f.calls.filter(c=>c.url.includes('grant_type=refresh_token')).length,0);
 assert.equal(f.backend.session().user.id,'user-B');
}
// A different tab/storage session is a boundary even without a local login call.
{
 const f=fixture(),pending=settle(f.backend.profile());await f.refreshStarted.promise;
 f.tab.setItem(key,JSON.stringify(B));f.refreshReply.resolve(response(renewedA));stale(await pending);
 assert.equal(f.backend.session().user.id,'user-B');
}
// Cancellation of A must not clear B's in-flight refresh or allow duplicate refreshes.
{
 const f=fixture(),old=settle(f.backend.profile());await f.refreshStarted.promise;
 await f.backend.signIn('b@example.test','synthetic-password');f.state.bExpired=true;
 const first=settle(f.backend.profile());await f.state.bRefreshStarted.promise;
 f.refreshReply.resolve(response({message:'Old token rejected'},400));stale(await old);
 const second=settle(f.backend.profile());await new Promise(r=>setTimeout(r,5));
 assert.equal(f.state.bRefreshCalls,1,'new-session refresh must remain single-flight');
 f.state.bRefreshReply.resolve(response(renewedB));
 assert.equal((await first).value.id,'user-B');assert.equal((await second).value.id,'user-B');
 assert.equal(f.backend.session().access_token,'renewed-B');
}
// A shared-storage account switch must not join the previous account's refresh.
{
 const f=fixture(),old=settle(f.backend.profile());await f.refreshStarted.promise;
 f.tab.setItem(key,JSON.stringify(B));f.state.bExpired=true;
 const current=settle(f.backend.profile());
 assert.equal(await Promise.race([f.state.bRefreshStarted.promise.then(()=>true),new Promise(r=>setTimeout(()=>r(false),50))]),true,'external session change needs a refresh for its own token');
 f.refreshReply.resolve(response(renewedA));stale(await old);
 f.state.bRefreshReply.resolve(response(renewedB));assert.equal((await current).value.id,'user-B');
 assert.equal(f.backend.session().access_token,'renewed-B');
}
// The server may identify the user when refreshing a recovery-link session.
// This legitimate hydration must still permit the requested password update.
{
 const f=fixture();f.tab.setItem(key,JSON.stringify({...A,user:null,recovery:true}));
 const update=settle(f.backend.updatePassword('synthetic-new-password'));await f.refreshStarted.promise;
 f.refreshReply.resolve(response(renewedA));assert.equal((await update).value?.updated,true,'same-session recovery refresh must permit password update');
 assert.equal(f.backend.session().user.id,'user-A');
}
console.log('Auth session races passed: logout/new-login boundaries, stale refresh success/rejection, stale 401, external storage changes and current-session refresh single-flight.');
