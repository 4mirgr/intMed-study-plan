import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Catches study-save starvation, stale badge reads, overlapping requests, and
// hidden/offline polling. Execute the shipped adapter and notification functions.
const app=fs.readFileSync(new URL('../docs/js/intmed-app.js',import.meta.url),'utf8');
const backend=fs.readFileSync(new URL('../docs/js/intmed-backend.js',import.meta.url),'utf8');
const section=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const id='11111111-1111-4111-8111-111111111111';
function fixture(role='user'){
  const elements=new Map(),timers=new Map(),listeners=new Map(),calls=[];
  let nextTimer=0,rows=[],failure=false,pending=null,legacy=[];
  const element=()=>({textContent:'',hidden:true,dataset:{},classList:{contains:()=>false,toggle(){}},setAttribute(){}});
  const document={visibilityState:'visible',activeElement:null,getElementById:key=>{if(!elements.has(key))elements.set(key,element());return elements.get(key);},addEventListener:(key,fn)=>listeners.set('document:'+key,fn)};
  const window={INTMED_CONFIG:{supabaseUrl:'https://synthetic.supabase.co',supabaseAnonKey:'synthetic'},addEventListener:(key,fn)=>listeners.set('window:'+key,fn)};
  const stored=JSON.stringify({access_token:'synthetic',user:{id}});
  const context=vm.createContext({window,document,navigator:{onLine:true},console,JSON,Promise,Set,Date,URLSearchParams,encodeURIComponent,AbortController,
    sessionStorage:{getItem:()=>stored},localStorage:{getItem:()=>null},
    setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:key=>timers.delete(key),
    fetch:async(url,options={})=>{
      calls.push({url,options});
      if(pending)await pending;
      if(failure)throw new Error('synthetic network failure');
      const body=url.includes('/intmed_conversations?')?rows:url.includes('/tickets?')?legacy:null;
      assert.notEqual(body,null,'poll must call only the isolated message tables');
      return {ok:true,status:200,text:async()=>JSON.stringify(body)};
    }
  });
  vm.runInContext(backend,context);
  vm.runInContext(`var CURRENT_USER_ID=${JSON.stringify(id)},STATE={users:{[CURRENT_USER_ID]:{backendRole:${JSON.stringify(role)},itemState:{note:{text:'unsaved note'}},profile:{}}},tickets:[]};
    var stateLoaded=true,dirty=false,flushing=false,flushQueued=false,flushTimer=null;
    var messageCenterMode='unknown',messageCenterFingerprint='',messageCenterRenderDeferred=false,adminTicketsPanel=null,recoveryPending=0,USER_NAMES={};
    function usesPrivateBackend(){return true;} function myBucket(){return STATE.users[CURRENT_USER_ID];}
    function faDigits(value){return String(value);} function renderTicketHistory(){} function renderAdminTickets(){}
    ${section('  function messageFingerprint(', '  function sendCenterMessage(')}
    ${section('  function updateManagementBadge(){', '  function markOwnMessagesRead(){')}
    ${section('  var messagePollTimer=', '\n  if(window.IntMedLibrary)')}`,context);
  const run=code=>vm.runInContext(code,context);
  return {run,calls,timers,document,elements,context,
    emit:key=>listeners.get(key)?.(),
    rows:value=>{rows=value;},legacy:value=>{legacy=value;},failure:value=>{failure=value;},hold:value=>{pending=value;},
    tick:async()=>{const polls=[...timers].filter(([,timer])=>timer.fn.name==='refreshMessageNotifications');assert.equal(polls.length,1,'exactly one next poll');const [key,timer]=polls[0];timers.delete(key);await timer.fn();return timer.delay;},
    badge:()=>document.getElementById('messagesBadge')
  };
}
const conversation=(senderRole='admin')=>[{id:'thread',user_id:id,status:'open',intmed_messages:[{id:'message',sender_id:senderRole==='admin'?'admin-id':id,sender_role:senderRole,body:'New message',created_at:'2026-11-05T10:00:00Z'}],intmed_conversation_reads:[]}];

const member=fixture();member.rows(conversation());member.run('dirty=true;flushing=true;');
await member.tick();
assert.equal(member.badge().textContent,'1','new normalized message must update badge during unsaved study work');
assert.equal(member.badge().hidden,false);
assert.equal(member.run('STATE.users[CURRENT_USER_ID].itemState.note.text'),'unsaved note');
assert.ok([...member.timers.values()][0].delay>=5000&&[...member.timers.values()][0].delay<=10000,'visible polling stays within five to ten seconds');
assert.ok(member.calls.every(call=>!call.options.method||call.options.method==='GET'),'poll performs no writes or AI requests');
member.rows([{...conversation()[0],intmed_conversation_reads:[{user_id:id,last_read_at:'2026-11-05T11:00:00Z'}]}]);
await member.tick();assert.equal(member.badge().hidden,true,'read on another device must clear badge');

const admin=fixture('admin');admin.rows(conversation('user'));await admin.tick();assert.equal(admin.badge().textContent,'1');
assert.equal(admin.document.getElementById('managementBadge').hidden,false);
admin.rows([{...conversation('user')[0],intmed_conversation_reads:[{user_id:id,last_read_at:'2026-11-05T11:00:00Z'}]}]);
await admin.tick();assert.equal(admin.badge().hidden,true);

const hidden=fixture();hidden.document.visibilityState='hidden';hidden.emit('document:visibilitychange');
assert.equal(hidden.timers.size,0,'hidden page cancels scheduled polling');
hidden.document.visibilityState='visible';hidden.emit('document:visibilitychange');assert.equal([...hidden.timers.values()][0].delay,0);
await hidden.tick();hidden.context.navigator.onLine=false;hidden.emit('window:offline');assert.equal(hidden.timers.size,0);
hidden.context.navigator.onLine=true;hidden.emit('window:online');assert.equal([...hidden.timers.values()][0].delay,0);
await hidden.tick();

const errors=fixture();errors.failure(true);await errors.tick();
assert.ok([...errors.timers.values()][0].delay<=10000,'a failed poll must retry within ten seconds');

const slow=fixture();let release;slow.hold(new Promise(resolve=>{release=resolve;}));
const inFlight=slow.tick();await Promise.resolve();slow.emit('window:focus');await slow.tick();
assert.equal(slow.calls.length,1,'focus during a request must not overlap polls');release();await inFlight;
assert.equal(slow.timers.size,1);

const compatibility=fixture();compatibility.legacy([{id:'old',user_id:id,payload:{message:'remote',read:false}}]);
compatibility.run("STATE.tickets=[{id:'old',userId:CURRENT_USER_ID,message:'local reply',read:true}];dirty=true;");
await compatibility.tick();assert.equal(compatibility.run('STATE.tickets[0].message'),'local reply','legacy drafts cannot be replaced while pending writes exist');
assert.equal(compatibility.run('dirty'),true);
const racing=fixture();racing.legacy([{id:'old',user_id:id,payload:{message:'remote',read:false}}]);
let finish;racing.hold(new Promise(resolve=>{finish=resolve;}));const response=racing.tick();
await Promise.resolve();racing.run("STATE.tickets=[{id:'old',userId:CURRENT_USER_ID,message:'edited during request'}];flushQueued=true;");
finish();await response;
assert.equal(racing.run('STATE.tickets[0].message'),'edited during request','legacy writes starting during a request must be protected');
console.log('Notification polling passed: member/admin unread updates, study-save isolation, bounded retry, pause/resume, no overlapping requests, and legacy draft preservation.');
