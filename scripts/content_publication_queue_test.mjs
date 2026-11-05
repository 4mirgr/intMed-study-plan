import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table public.intmed_content_drafts(
 id uuid primary key,title text,status text,publish_requested_at timestamptz,
 updated_at timestamptz default now(),publishing_runner text,publishing_started_at timestamptz,
 publish_error text,reviewed_at timestamptz,reviewed_by uuid,draft_json jsonb default '{}');
grant select,update on public.intmed_content_drafts to service_role;
`);
await db.exec(fs.readFileSync('backend/supabase/content_publication_queue.sql','utf8'));
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const [n,status,age,runner] of [[1,'publish_requested',20,null],[2,'publish_requested',30,null],[3,'approved',40,null],[4,'rejected',50,null],[5,'draft_ready',60,null],[6,'publish_error',70,null]]){
 await db.query(`insert into public.intmed_content_drafts(id,title,status,publish_requested_at,publishing_runner,reviewed_at,draft_json)
 values($1,$2,$3,now()-$4*interval '1 minute',$5,now(),'{"approved":"preserve"}')`,[id(n),'Topic '+n,status,age,runner]);
}
const claim=async()=>(await db.query('select public.claim_intmed_publication() as job')).rows[0].job;
const row=async n=>(await db.query('select * from public.intmed_content_drafts where id=$1',[id(n)])).rows[0];
await db.exec('set role service_role');
const claims=await Promise.all([claim(),claim(),claim()]);
assert.deepEqual(claims.filter(Boolean),[{id:id(2),title:'Topic 2'}],'Competing claims must dispatch exactly one oldest publication');
assert.equal((await row(2)).publishing_runner,'github-actions');
assert.equal((await row(2)).publish_error,null);
await db.query("update public.intmed_content_drafts set publishing_started_at=now()-interval '36 minutes' where id=$1",[id(2)]);
assert.deepEqual(await claim(),{id:id(1),title:'Topic 1'});
const expired=await row(2);
assert.equal(expired.status,'publish_error');
assert.match(expired.publish_error,/expired|timed out/i);
assert.ok(expired.reviewed_at);assert.deepEqual(expired.draft_json,{approved:'preserve'});
assert.equal(await claim(),null,'Active publisher must block even with an expired different runner');
await db.query("update public.intmed_content_drafts set status='published' where id=$1",[id(1)]);
assert.equal(await claim(),null,'Review and failed states must not implicitly enqueue');
await db.query("update public.intmed_content_drafts set status='publishing',publishing_runner='local-review',publishing_started_at=now()-interval '2 hours' where id=$1",[id(3)]);
await db.query("update public.intmed_content_drafts set status='publish_requested',publish_requested_at=null where id=$1",[id(1)]);
assert.equal(await claim(),null,'Any publishing runner must serialize canonical writes');
assert.equal((await row(3)).status,'publishing','Cloud timeout must not expire other runners');
await db.query("update public.intmed_content_drafts set status='published' where id=$1",[id(3)]);
assert.deepEqual(await claim(),{id:id(1),title:'Topic 1'});
await db.exec('reset role');
for(const role of ['anon','authenticated']){
 assert.equal((await db.query('select has_function_privilege($1,\'public.claim_intmed_publication()\',\'EXECUTE\') as allowed',[role])).rows[0].allowed,false);
 await db.exec('set role '+role);
 await assert.rejects(claim,/permission denied/);
 await db.exec('reset role');
}
assert.equal((await db.query("select prosecdef from pg_proc where oid='public.claim_intmed_publication()'::regprocedure")).rows[0].prosecdef,false);
await db.close();
console.log('Publication queue passed: service-only invoker, oldest-first single active claim, stale cloud recovery and preserved review decisions.');
