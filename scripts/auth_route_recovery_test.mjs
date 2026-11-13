import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('docs/js/intmed-backend.js','utf8');
const id='11111111-1111-4111-8111-111111111111';
const session={access_token:'test-access',refresh_token:'test-refresh',user:{id}};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function backend(fetch,tab=storage(),extra={}){
 const window={INTMED_CONFIG:{supabaseUrl:'https://gateway.test',supabaseFallbackUrl:'https://direct.test',supabaseAnonKey:'public',authPrimaryTimeoutMs:25,authFallbackTimeoutMs:30,authProbeTimeoutMs:20,authProbeDelayMs:5,authSignInTimeoutMs:100,...extra}};
 vm.runInNewContext(code,{window,fetch,localStorage:storage(),sessionStorage:tab,AbortController,setTimeout,clearTimeout,URLSearchParams,console});
 return window.IntMedBackend;
}
// A live but slower username-auth response must not be cut off by the short
// gateway selection deadline. Only harmless GET probes may overlap.
{
 const calls=[];
 const b=backend(async(url,options)=>{
  calls.push({url,method:options.method||'GET'});
  if(url.includes('/health'))return url.startsWith('https://gateway.test')?new Promise(()=>{}):response({name:'GoTrue'});
  if(url.includes('intmed-login')){await new Promise(r=>setTimeout(r,55));return response(session);}
  if(url.includes('/profiles'))return response({id,approved:true,role:'user'});
  return response({ok:true});
 });
 assert.equal((await b.signIn('doctor','exact password')).session.user.id,id);
 const passwords=calls.filter(x=>x.url.includes('intmed-login'));
 assert.deepEqual(passwords,[{url:'https://direct.test/functions/v1/intmed-login',method:'POST'}]);
}
// Remember only a configured route across the login reload, never arbitrary
// sessionStorage URLs that could receive credentials.
{
 const tab=storage(),fetch=async url=>{
  if(url.startsWith('https://gateway.test'))throw Error('network unavailable');
  if(url.includes('intmed-login'))return response(session);
  if(url.includes('/profiles'))return response({id,approved:true,role:'user'});
  return response({name:'GoTrue'});
 };
 await backend(fetch,tab).signIn('doctor','password');
 const calls=[];await backend(async url=>{calls.push(url);return response({name:'GoTrue'});},tab).checkAuthConnection();
 assert.equal(calls[0],'https://direct.test/auth/v1/health');
 const other=[];const different=backend(async url=>{other.push(url);return response({name:'GoTrue'});},tab,{supabaseUrl:'https://new.test',supabaseFallbackUrl:''});
 await different.checkAuthConnection();assert.equal(other[0],'https://new.test/auth/v1/health');
}
// Credential rejection/rate limits remain definitive; route discovery does not
// race passwords against both gateways or grant app access from a health reply.
for(const status of [400,401,429]){
 let posts=0;
 const b=backend(async(url,options)=>{
  if(url.includes('/health'))return response({name:'GoTrue'});
  if(options.method==='POST'){posts++;return response({message:'Rejected'},status);}
  throw Error('Profile must not be read after rejected login');
 });
 await assert.rejects(b.signIn('doctor','wrong'),e=>e.status===status);
 assert.equal(posts,1);assert.equal(b.session(),null);
}
// A manual retry after the network changes must discover the newly healthy
// route and give its valid slow login the same processing budget.
{
 let switched=false;
 const b=backend(async(url,options)=>{
  const primary=url.startsWith('https://gateway.test');
  if(url.includes('/health')){if(switched&&primary)throw Error('network changed');return response({name:'GoTrue'});}
  if(url.includes('intmed-login')){
   if(!switched)return response({message:'Invalid credentials'},401);
   if(primary)throw Error('network changed');
   await new Promise(r=>setTimeout(r,55));return response(session);
  }
  if(url.includes('/profiles'))return response({id,approved:true,role:'user'});
  return response({ok:true});
 });
 await assert.rejects(b.signIn('doctor','wrong'),e=>e.status===401);switched=true;
 assert.equal((await b.signIn('doctor','correct')).session.user.id,id);
}
console.log('Auth route recovery passed: bounded safe discovery, slow valid login, one password exchange, remembered configured route, definitive errors and recovery after network changes.');
