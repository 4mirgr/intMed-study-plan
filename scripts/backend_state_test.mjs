import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const bucket={itemState:{old:{note:'old'}},meta:{},highlights:{},loginLog:[]};
let remote={state:structuredClone(bucket),updated_at:'2026-10-20T10:00:00.000Z'}, conflict=true;
const calls=[],store=new Map([['intmed_supabase_session',JSON.stringify({access_token:'fake-test',user:{id:owner}})]]);
const response=(body,status=200)=>Promise.resolve({ok:status>=200&&status<300,status,text:()=>Promise.resolve(body==null?'':JSON.stringify(body))});
function fetchMock(url,options={}){
 calls.push({url,options});const path=new URL(url).pathname;
 if(path.endsWith('/profiles'))return response([{id:owner,role:'admin',approved:true,full_name:'Admin'},{id:other,role:'user',approved:true,full_name:'Other'}]);
 if(path.endsWith('/tickets'))return response([]);
 if(path.endsWith('/study_state')){
  if(options.method==='PATCH'){
   if(conflict){conflict=false;remote.state.itemState.anotherDevice={note:'preserve this'};remote.updated_at='2026-10-20T10:00:01.000Z';return response([])}
   assert.ok(url.includes('user_id=eq.'+owner));const next=JSON.parse(options.body);remote=next;return response([next]);
  }
  if(url.includes('user_id=eq.'))return response([remote]);
  return response([{user_id:owner,...remote},{user_id:other,state:{itemState:{privateOther:{note:'untouched'}}},updated_at:remote.updated_at}]);
 }
 throw Error('Unexpected endpoint '+url);
}
const window={INTMED_CONFIG:{supabaseUrl:'https://test.supabase.co',supabaseAnonKey:'public-test'}};
const context=vm.createContext({window,fetch:fetchMock,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},JSON,Promise,Set,Date,URLSearchParams,encodeURIComponent,console});
vm.runInContext(fs.readFileSync(new URL('../docs/js/intmed-backend.js',import.meta.url),'utf8'),context);
const state=await window.IntMedBackend.loadLegacyState();state.users[owner].itemState.newNote={note:'my update'};state.users[owner].itemState['favorite:cardio-ecg']={favorite:true};
await window.IntMedBackend.saveLegacyState(state);
assert.equal(remote.state.itemState.anotherDevice.note,'preserve this');assert.equal(remote.state.itemState.newNote.note,'my update');assert.equal(remote.state.itemState['favorite:cardio-ecg'].favorite,true);
const writes=calls.filter(c=>c.options.method);
assert.ok(writes.every(c=>c.url.includes('/study_state?user_id=eq.'+owner)),'Unexpected user/profile/ticket write');
assert.equal(writes.length,2,'Expected failed CAS then successful retry');
const count=calls.length;await window.IntMedBackend.saveLegacyState(state);assert.equal(calls.length,count,'Unchanged save performed network writes');
console.log('State regression passed: admin cannot rewrite other users, CAS retries preserve concurrent device edits, unchanged profiles/tickets are not rewritten.');

state.users[owner].itemState['favorite:cardio-ecg']={favorite:false};await window.IntMedBackend.saveLegacyState(state);assert.equal(remote.state.itemState['favorite:cardio-ecg'].favorite,false);assert.equal(remote.state.itemState.anotherDevice.note,'preserve this');
