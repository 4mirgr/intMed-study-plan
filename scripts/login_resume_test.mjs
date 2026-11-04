import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/js/intmed-backend.js',import.meta.url),'utf8');
const userId='11111111-1111-4111-8111-111111111111';
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
function fixture(){
  const state={passwordCalls:0,profileCalls:0,failures:0,approved:true,invalidPassword:false};
  const window={INTMED_CONFIG:{supabaseUrl:'https://gateway.test',supabaseFallbackUrl:'https://direct.test',supabaseAnonKey:'public',authPrimaryTimeoutMs:30,authFallbackTimeoutMs:50}};
  const fetch=async url=>{
    let value,status=200;
    if(url.includes('grant_type=password')){state.passwordCalls++;status=state.invalidPassword?401:200;value=status===401?{message:'Invalid credentials'}:{access_token:'synthetic-access',refresh_token:'synthetic-refresh',user:{id:userId}};}
    else if(url.includes('/profiles')){state.profileCalls++;status=state.profileCalls<=state.failures?503:200;value=status===503?{message:'Temporary profile outage'}:{id:userId,approved:state.approved,rejected:false,role:'user'};}
    else if(url.includes('intmed-telegram-bot'))value={ok:true};
    else throw Error('Unexpected request '+url);
    return {status,ok:status>=200&&status<300,text:async()=>JSON.stringify(value)};
  };
  vm.runInNewContext(source,{window,fetch,localStorage:storage(),sessionStorage:storage(),AbortController,setTimeout,clearTimeout,URLSearchParams,console});
  return {backend:window.IntMedBackend,state};
}

// A temporary profile outage must retry profile verification, never password Auth.
{
  const {backend,state}=fixture();state.failures=2;
  const result=await backend.signIn('synthetic@example.test','synthetic-password');
  assert.equal(result.profile.approved,true);assert.equal(state.passwordCalls,1);
}
// Exhausted verification retains the session and can be resumed without credentials.
{
  const {backend,state}=fixture();state.failures=99;
  await assert.rejects(backend.signIn('synthetic@example.test','synthetic-password'),error=>error.code==='profile_unavailable');
  assert.ok(backend.session());state.failures=0;
  const result=await backend.resumeSignIn();assert.equal(result.session.user.id,userId);assert.equal(state.passwordCalls,1);
}
// No retry or app access for an explicitly inactive account or invalid password.
{
  const {backend,state}=fixture();state.approved=false;
  await assert.rejects(backend.signIn('synthetic@example.test','synthetic-password'),error=>error.code==='account_inactive');
  assert.equal(backend.session(),null);assert.equal(state.profileCalls,1);
}
{
  const {backend,state}=fixture();state.invalidPassword=true;
  await assert.rejects(backend.signIn('synthetic@example.test','wrong-password'),error=>error.status===401);
  assert.equal(state.passwordCalls,1);assert.equal(state.profileCalls,0);assert.equal(backend.session(),null);
}
console.log('Login resume passed: transient profile retry, retained session, no repeated password exchange, inactive and invalid accounts blocked.');
