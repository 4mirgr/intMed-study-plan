import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
const adminId='11111111-1111-4111-8111-111111111111',memberId='22222222-2222-4222-8222-222222222222',otherId='33333333-3333-4333-8333-333333333333';
let handler,isAdmin=true,authenticated=true,sends=0,failSend=false,casConflict=false;
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'public-key',RESEND_API_KEY:'provider-secret',NEWSLETTER_FROM:'IntMed <updates@example.com>',NEWSLETTER_SIGNING_SECRET:'synthetic-signing-secret-32-characters-minimum'};
const profiles=[{id:adminId,email:'admin@example.com',approved:true,rejected:false,role:'admin'},{id:memberId,email:'member@example.com',approved:true,rejected:false,role:'user'},{id:otherId,email:'other@example.com',approved:true,rejected:false,role:'user'}];
const states={[memberId]:{itemState:{topic:{note:'keep this note'},'favorite:topic':{favorite:true},'newsletter:subscription':{subscribed:true,email:'member@example.com'}},highlights:{topic:[{id:'h1',quote:'keep highlight'}]}},[otherId]:{itemState:{'newsletter:subscription':{subscribed:false,email:'other@example.com'}},highlights:{}}};
const logs=[],mail=[];let timestamp='2026-10-21T00:00:00.000Z';
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:k=>env[k]}},Response,URL,TextEncoder,TextDecoder,Uint8Array,btoa,atob,crypto:webcrypto,setTimeout:fn=>fn(),fetch:async (address,options={})=>{
 const u=new URL(address),body=options.body?JSON.parse(options.body):{},method=options.method||'GET';
 if(u.pathname==='/auth/v1/user')return authenticated?Response.json({id:adminId}):Response.json({},{status:401});
 if(u.pathname.startsWith('/auth/v1/admin/users/')){const id=u.pathname.split('/').pop(),p=profiles.find(p=>p.id===id);return Response.json({email:p.email,email_confirmed_at:'2026-10-01T00:00:00Z'});}
 if(u.pathname==='/rest/v1/profiles'){let rows=profiles;const filter=u.searchParams.get('id');if(filter)rows=rows.filter(p=>p.id===filter.slice(3));return Response.json(rows.map(p=>p.id===adminId?{...p,role:isAdmin?'admin':'user'}:p));}
 if(u.pathname==='/rest/v1/study_state'){
  const filter=u.searchParams.get('user_id');let ids=Object.keys(states);if(filter?.startsWith('eq.'))ids=[filter.slice(3)].filter(id=>states[id]);if(filter?.startsWith('in.('))ids=ids.filter(id=>filter.includes(id));
  if(method==='PATCH'){assert.equal(ids.length,1);if(casConflict){casConflict=false;states[ids[0]].itemState.concurrent={note:'another device note'};timestamp='2026-10-21T00:00:01.000Z';return Response.json([]);}assert.equal(u.searchParams.get('updated_at'),'eq.'+timestamp);states[ids[0]]=body.state;timestamp=body.updated_at;return Response.json([{user_id:ids[0],state:body.state,updated_at:timestamp}]);}
  return Response.json(ids.map(id=>({user_id:id,state:states[id],updated_at:timestamp})));
 }
 if(u.pathname==='/rest/v1/intmed_newsletter_deliveries'){
  if(method==='POST'){if(logs.some(l=>l.campaign_id===body.campaign_id&&l.user_id===body.user_id))return Response.json([]);logs.push(body);return Response.json([body]);}
  let rows=logs;if(u.searchParams.get('campaign_id'))rows=rows.filter(l=>l.campaign_id===u.searchParams.get('campaign_id').slice(3));if(u.searchParams.get('user_id'))rows=rows.filter(l=>l.user_id===u.searchParams.get('user_id').slice(3));if(method==='PATCH'){rows.forEach(l=>Object.assign(l,body));return new Response(null,{status:204});}return Response.json(rows);
 }
 if(address==='https://api.resend.com/emails'){sends++;mail.push(body);assert.equal(body.to.length,1);assert.equal(options.headers.Authorization,'Bearer provider-secret');return failSend?Response.json({error:'failed'},{status:429}):Response.json({id:'email-'+sends});}
 throw Error('Unexpected endpoint '+address);
}});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-newsletter/index.ts','utf8'),context);
const post=body=>handler(new Request('https://test.supabase.co/functions/v1/intmed-newsletter',{method:'POST',headers:{Authorization:'Bearer user-jwt',Origin:'https://drgerami-md.ir'},body:JSON.stringify(body)}));
const payload={action:'send',subject:'Site updates',text:'New ECG questions',campaignId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
let r=await post({action:'status'});assert.equal((await r.json()).configured,true);
authenticated=false;assert.equal((await post(payload)).status,401);authenticated=true;isAdmin=false;assert.equal((await post(payload)).status,403);assert.equal(sends,0);isAdmin=true;
assert.equal((await (await post({...payload,action:'preview'})).json()).recipients,1);assert.equal(sends,0);
r=await post(payload);assert.equal(r.status,200);assert.equal((await r.json()).sent,1);assert.equal(sends,1);assert.deepEqual(mail[0].to,['member@example.com']);assert.equal(logs[0].status,'sent');
await post(payload);assert.equal(sends,1,'Duplicate campaign sent again');assert.equal((await post({...payload,text:'changed'})).status,409);
const unsubscribe=mail[0].text.match(/https:\/\/drgerami-md\.ir\/newsletter\.html#token=\S+/)[0],unsubscribeToken=new URLSearchParams(new URL(unsubscribe).hash.slice(1)).get('token');
const publicUnsubscribe=token=>handler(new Request('https://test.supabase.co/functions/v1/intmed-newsletter',{method:'POST',headers:{Origin:'https://drgerami-md.ir','Content-Type':'application/json'},body:JSON.stringify({action:'unsubscribe',token})}));
r=await handler(new Request('https://test.supabase.co/functions/v1/intmed-newsletter'));assert.equal(r.status,403);assert.equal(states[memberId].itemState['newsletter:subscription'].subscribed,true,'GET email scanner changed consent');
r=await publicUnsubscribe(unsubscribeToken+'x');assert.ok((await r.text()).includes('معتبر نیست'));assert.equal(states[memberId].itemState['newsletter:subscription'].subscribed,true);
casConflict=true;r=await publicUnsubscribe(unsubscribeToken);assert.ok((await r.text()).includes('لغو شد'));assert.equal(states[memberId].itemState['newsletter:subscription'].subscribed,false);assert.equal(states[memberId].itemState.topic.note,'keep this note');assert.equal(states[memberId].highlights.topic[0].quote,'keep highlight');assert.equal(states[memberId].itemState.concurrent.note,'another device note');assert.equal(states[otherId].itemState['newsletter:subscription'].subscribed,false);
await post({...payload,campaignId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});assert.equal(sends,1,'Unsubscribed member received mail');
states[memberId].itemState['newsletter:subscription'].subscribed=true;profiles[1].email='new@example.com';await post({...payload,campaignId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});assert.equal(sends,1,'Changed email reused old consent');profiles[1].email='member@example.com';
failSend=true;r=await post({...payload,campaignId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});assert.equal((await r.json()).failed,1);await post({...payload,campaignId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});assert.equal(sends,2,'Failed delivery retried automatically');
const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create table public.profiles(id uuid primary key);');await db.exec(fs.readFileSync('backend/supabase/newsletter.sql','utf8'));await db.exec(fs.readFileSync('backend/supabase/newsletter.sql','utf8'));const perms=await db.query("select has_table_privilege('anon','public.intmed_newsletter_deliveries','select') as anon,has_table_privilege('authenticated','public.intmed_newsletter_deliveries','select') as member,has_table_privilege('service_role','public.intmed_newsletter_deliveries','insert') as server");assert.deepEqual(perms.rows[0],{anon:false,member:false,server:true});await db.close();
console.log('Newsletter passed: admin/Auth enforcement, preview never sends, opt-in/email match, one recipient, deduplication, no implicit retries, signed unsubscribe confirmation/tamper resistance, CAS preserves concurrent notes/highlights, idempotent SQL and private delivery log.');
