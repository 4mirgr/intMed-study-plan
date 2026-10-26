import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222';
const ingest='33333333-3333-4333-8333-333333333333',lease='44444444-4444-4444-8444-444444444444';
await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table public.profiles(id uuid primary key,role text,approved boolean,rejected boolean);
 create table public.intmed_content_ingest(id uuid primary key,status text,error_code text,updated_at timestamptz default now());
 create table public.intmed_content_drafts(ingest_id uuid primary key references public.intmed_content_ingest(id),status text,topic_id text,topic_confidence numeric,title text,source_summary text,extracted_text text,draft_json jsonb,provider text,model text,prompt_version text,error_code text,attempts integer default 0,updated_at timestamptz default now());
 create table public.intmed_content_worker_lease(lease_key text primary key,owner uuid,lease_until timestamptz,updated_at timestamptz default now());
 insert into public.intmed_content_worker_lease(lease_key,owner,lease_until) values('worker',null,'-infinity');
 create function public.claim_intmed_content_ingest(requested uuid,lease_owner uuid) returns uuid language plpgsql security definer set search_path=public as $$
 declare found_id uuid;begin
  update intmed_content_worker_lease set owner=lease_owner,lease_until=now()+interval '10 minutes' where lease_key='worker' and (lease_until<=now() or owner=lease_owner);if not found then return null;end if;
  select i.id into found_id from intmed_content_ingest i left join intmed_content_drafts d on d.ingest_id=i.id where i.status in('pending_review','error') and coalesce(d.attempts,0)<20 and (d.ingest_id is null or d.status='queued' or (d.status='waiting_provider' and d.error_code in('provider_rate_limited','provider_quota','provider_unavailable','provider_not_configured'))) order by i.id limit 1 for update of i skip locked;
  if found_id is null then update intmed_content_worker_lease set owner=null,lease_until=now() where lease_key='worker' and owner=lease_owner;return null;end if;
  insert into intmed_content_drafts(ingest_id,status,attempts) values(found_id,'processing',1) on conflict(ingest_id) do update set status='processing',attempts=intmed_content_drafts.attempts+1;
  update intmed_content_ingest set status='processing' where id=found_id;return found_id;end$$;
 create function public.release_intmed_content_lease(lease_owner uuid) returns void language sql security definer set search_path=public as $$update intmed_content_worker_lease set owner=null,lease_until=now() where lease_key='worker' and owner=lease_owner$$;
 insert into profiles values('${admin}','admin',true,false),('${member}','user',true,false);
 insert into intmed_content_ingest values('${ingest}','pending_review',null,now());
 insert into intmed_content_drafts(ingest_id,status,error_code,provider,attempts) values('${ingest}','waiting_provider','provider_rate_limited','openai',1);
`);
await db.exec(fs.readFileSync('backend/supabase/local_content_runner.sql','utf8'));

let result=await db.query(`select public.claim_intmed_local_content('${admin}','${lease}','macbook.local') value`);
assert.equal(result.rows[0].value,ingest);
assert.equal((await db.query(`select public.heartbeat_intmed_local_content('${ingest}','${lease}','${admin}') value`)).rows[0].value,true);
const draft={suggestedTopicId:'id-cns-meningoencephalitis',confidence:.8,title:'انسفالیت',sourceSummary:'خلاصه',medicalWarnings:[],lessonOutline:[],mcqDrafts:[],kfDrafts:[],imageCandidates:[],sourceEvidence:[]};
result=await db.query(`select public.complete_intmed_local_content($1,$2,$3,$4::jsonb,'extract','qwen','intmed-local-v1') value`,[ingest,lease,admin,JSON.stringify(draft)]);
assert.equal(result.rows[0].value,true);
result=await db.query(`select status,provider,model,prompt_version from intmed_content_drafts where ingest_id=$1`,[ingest]);
assert.deepEqual(result.rows[0],{status:'draft_ready',provider:'lmstudio',model:'qwen',prompt_version:'intmed-local-v1'});

await db.exec(`set role authenticated;`);
await assert.rejects(db.query('select * from public.intmed_content_local_jobs'),/permission denied/);
await assert.rejects(db.query(`select public.claim_intmed_local_content('${member}',gen_random_uuid(),'bad')`),/permission denied/);
await db.exec('reset role');
await db.close();
console.log('Local runner SQL passed: atomic claim/heartbeat/complete, draft-only persistence and no authenticated table/RPC access.');
