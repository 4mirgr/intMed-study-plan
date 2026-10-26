import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const bucket={itemState:{old:{note:'old'},'activity:cardio-ecg:2026-10-21':{opens:1,seconds:10,types:{lesson:1},lastOpenedAt:'2026-10-21T10:00:00Z'}},meta:{},highlights:{},loginLog:[]};
let remote={state:structuredClone(bucket),updated_at:'2026-10-20T10:00:00.000Z'}, conflict=true;
let missingState=false;
const calls=[],store=new Map([['intmed_supabase_session',JSON.stringify({access_token:'fake-test',user:{id:owner}})]]),tabStore=new Map();
const response=(body,status=200)=>Promise.resolve({ok:status>=200&&status<300,status,text:()=>Promise.resolve(body==null?'':JSON.stringify(body))});
function fetchMock(url,options={}){
 calls.push({url,options});const path=new URL(url).pathname;
 if(path.endsWith('/profiles'))return response([{id:owner,role:'admin',approved:true,full_name:'Admin'},{id:other,role:'user',approved:true,full_name:'Other'}]);
 if(path.endsWith('/tickets'))return response([]);
 if(path.endsWith('/functions/v1/intmed-telegram-bot'))return response({ok:true});
 if(path.endsWith('/study_state')){
  if(missingState){if(options.method==='POST'){const body=JSON.parse(options.body);remote={state:body.state,updated_at:'2026-10-21T12:30:00.000Z'};missingState=false;return response([{user_id:owner,...remote}]);}return response([]);}
  if(options.method==='PATCH'){
   if(conflict){conflict=false;remote.state.itemState.anotherDevice={note:'preserve this'};remote.state.itemState['activity:cardio-ecg:2026-10-21']={opens:3,seconds:30,types:{lesson:3},lastOpenedAt:'2026-10-21T11:00:00Z'};remote.updated_at='2026-10-20T10:00:01.000Z';return response([])}
   assert.ok(url.includes('user_id=eq.'+owner));const next=JSON.parse(options.body);remote=next;return response([next]);
  }
  if(url.includes('user_id=eq.'))return response([remote]);
  return response([{user_id:owner,...remote},{user_id:other,state:{itemState:{privateOther:{note:'untouched'}}},updated_at:remote.updated_at}]);
 }
 throw Error('Unexpected endpoint '+url);
}
const window={INTMED_CONFIG:{supabaseUrl:'https://test.supabase.co',supabaseAnonKey:'public-test'}};
const context=vm.createContext({window,fetch:fetchMock,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},sessionStorage:{getItem:k=>tabStore.get(k)||null,setItem:(k,v)=>tabStore.set(k,v),removeItem:k=>tabStore.delete(k)},JSON,Promise,Set,Date,URLSearchParams,encodeURIComponent,setTimeout,clearTimeout,AbortController,console});
vm.runInContext(fs.readFileSync(new URL('../docs/js/intmed-backend.js',import.meta.url),'utf8'),context);
const state=await window.IntMedBackend.loadLegacyState();state.users[owner].itemState['activity:cardio-ecg:2026-10-21']={opens:2,seconds:15,types:{lesson:2},lastOpenedAt:'2026-10-21T10:30:00Z'};state.users[owner].itemState.newNote={note:'my update'};state.users[owner].itemState['favorite:cardio-ecg']={favorite:true};
await window.IntMedBackend.saveLegacyState(state);
assert.equal(remote.state.itemState.anotherDevice.note,'preserve this');assert.equal(remote.state.itemState.newNote.note,'my update');assert.equal(remote.state.itemState['favorite:cardio-ecg'].favorite,true);
const writes=calls.filter(c=>c.options.method&&c.url.includes('/rest/v1/'));
assert.ok(writes.every(c=>c.url.includes('/study_state?user_id=eq.'+owner)),'Unexpected user/profile/ticket write');
assert.equal(writes.length,2,'Expected failed CAS then successful retry');
const count=calls.length;await window.IntMedBackend.saveLegacyState(state);assert.equal(calls.length,count,'Unchanged save performed network writes');
console.log('State regression passed: admin cannot rewrite other users, CAS retries preserve concurrent device edits, unchanged profiles/tickets are not rewritten.');

state.users[owner].itemState['favorite:cardio-ecg']={favorite:false};await window.IntMedBackend.saveLegacyState(state);assert.equal(remote.state.itemState['favorite:cardio-ecg'].favorite,false);assert.equal(remote.state.itemState.anotherDevice.note,'preserve this');

assert.equal(remote.state.itemState['activity:cardio-ecg:2026-10-21'].opens,4);assert.equal(remote.state.itemState['activity:cardio-ecg:2026-10-21'].seconds,35);assert.equal(remote.state.itemState['activity:cardio-ecg:2026-10-21'].types.lesson,4);console.log('Concurrent activity counters preserve positive increments from both devices.');

// A stale second device must not replace a first answer or erase independent attempts.
state.users[owner].itemState['exam-answer:attempt-one:q1']={attemptId:'attempt-one',questionId:'q1',selectedIndex:1,correct:false,answeredAt:'2026-10-21T12:00:02Z'};
remote.state.itemState['exam-answer:attempt-one:q1']={attemptId:'attempt-one',questionId:'q1',selectedIndex:0,correct:true,answeredAt:'2026-10-21T12:00:01Z'};
remote.state.itemState['exam-attempt:another-device']={id:'another-device',topicId:'cardio-ecg',type:'mcq',questions:[]};
state.users[owner].itemState['exam-answer:attempt-one:q2']={attemptId:'attempt-one',questionId:'q2',selectedIndex:2,correct:false,answeredAt:'2026-10-21T12:00:03Z'};
await window.IntMedBackend.saveLegacyState(state);
assert.equal(remote.state.itemState['exam-answer:attempt-one:q1'].selectedIndex,0);
assert.equal(remote.state.itemState['exam-answer:attempt-one:q2'].selectedIndex,2);
assert.equal(remote.state.itemState['exam-attempt:another-device'].id,'another-device');
state.users[owner].itemState['exam-close:attempt-one']={endedAt:'2026-10-21T12:10:00Z'};
state.users[owner].itemState['exam-attempt:attempt-two']={id:'attempt-two',topicId:'cardio-ecg',type:'mcq',questions:[]};
await window.IntMedBackend.saveLegacyState(state);
assert.equal(remote.state.itemState['exam-answer:attempt-one:q1'].correct,true);
assert.ok(remote.state.itemState['exam-close:attempt-one']);assert.ok(remote.state.itemState['exam-attempt:attempt-two']);
console.log('Exam CAS regression passed: first answer, parallel questions/attempts and reset history survive stale-device saves.');

missingState=true;vm.runInContext(fs.readFileSync(new URL('../docs/js/intmed-backend.js',import.meta.url),'utf8'),context);const freshState=await window.IntMedBackend.loadLegacyState();freshState.users[owner].itemState['exam-answer:first:q1']={attemptId:'first',questionId:'q1',selectedIndex:1,correct:true,answeredAt:'2026-10-21T12:30:00Z'};freshState.users[owner].itemState['activity:cardio-ecg:2026-10-21']={opens:1,seconds:10,types:{mcq:1}};await window.IntMedBackend.saveLegacyState(freshState);assert.equal(remote.state.itemState['exam-answer:first:q1'].correct,true);assert.equal(remote.state.itemState['activity:cardio-ecg:2026-10-21'].opens,1);console.log('Fresh-account state creation preserves the first exam/activity without an existing study row.');
