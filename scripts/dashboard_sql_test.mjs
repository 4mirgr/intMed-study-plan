import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',pending='33333333-3333-4333-8333-333333333333';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create schema net;
 grant usage on schema auth to authenticated,anon;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.test_network_events(body jsonb);
 create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 5000) returns bigint language plpgsql as $$ begin insert into public.test_network_events values(body);return 1;end;$$;`);
 for(const file of ['schema.sql','registration_upgrade.sql','delete_user.sql','dashboard_upgrade.sql','telegram_notifications.sql','newsletter.sql','security_hardening.sql','setup_services.sql']){
  await db.exec(fs.readFileSync('backend/supabase/'+file,'utf8').replace(/create extension if not exists [^;]+;/g,''));
 }
 for(const [id,username] of [[owner,'old-owner'],[member,'member']])await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,username+'@example.com',JSON.stringify({username})]);
 await db.query("update public.profiles set approved=true,role=case when id=$1 then 'admin' else 'user' end",[owner]);
 await db.query('update public.study_state set state=$1 where user_id=$2',[JSON.stringify({highlights:{'cardio-ecg':[{id:'hl-one',quote:'preserve'}]},itemState:{'cardio-ecg':{note:'my note'}}}),member]);
 const before=(await db.query('select state from public.study_state where user_id=$1',[member])).rows[0].state;
 async function asUser(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
 await asUser(member);await db.query("update public.profiles set full_name='Updated name',phone='123' where id=$1",[member]);await db.query("select public.update_intmed_username('new_member')");
 await assert.rejects(db.query("update public.profiles set email='fake@example.com' where id=$1",[member]),/permission denied/);
 await assert.rejects(db.query("update public.profiles set role='admin' where id=$1",[member]),/permission denied/);
 await assert.rejects(db.query('select public.set_intmed_user_approval($1,false)',[owner]),/admin required/);
 assert.deepEqual((await db.query('select state from public.study_state where user_id=$1',[member])).rows[0].state,before);
 await db.exec('reset role');await db.query("update auth.users set email='verified-new@example.com' where id=$1",[member]);assert.equal((await db.query('select email from public.profiles where id=$1',[member])).rows[0].email,'verified-new@example.com');
 await db.exec(fs.readFileSync('backend/supabase/rename_owner_drgerami.sql','utf8'));
 assert.equal((await db.query('select username from public.profiles where id=$1',[owner])).rows[0].username,'drgerami');assert.equal((await db.query('select email from auth.users where id=$1',[owner])).rows[0].email,'old-owner@example.com');
 await asUser(owner);await assert.rejects(db.query('select public.set_intmed_user_approval($1,false)',[owner]),/Administrator access/);await db.query('select public.set_intmed_user_approval($1,false)',[member]);
 await db.exec('reset role');assert.deepEqual((await db.query('select state from public.study_state where user_id=$1',[member])).rows[0].state,before);
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[pending,'pending@example.com',JSON.stringify({app:'intmed',username:'pending',fullName:'New user',degree:'رزیدنت'})]);
 assert.equal((await db.query('select count(*)::int n from public.test_network_events')).rows[0].n,1);
 assert.equal((await db.query('select status from public.intmed_signup_alerts where user_id=$1',[pending])).rows[0].status,'pending');
 await asUser(member);await assert.rejects(db.query('select * from public.intmed_notification_settings'),/permission denied/);await assert.rejects(db.query('select public.claim_intmed_signup_alert($1)',[pending]),/permission denied/);
 await asUser('', 'service_role');assert.equal((await db.query('select public.claim_intmed_signup_alert($1) claimed',[pending])).rows[0].claimed,true);assert.equal((await db.query('select public.claim_intmed_signup_alert($1) claimed',[pending])).rows[0].claimed,false);
 await db.query("update public.intmed_signup_alerts set status='sent' where user_id=$1",[pending]);assert.equal((await db.query('select public.claim_intmed_signup_alert($1) claimed',[pending])).rows[0].claimed,false);
 await db.exec('reset role');await db.query("update public.profiles set approved=true,rejected=false,role='admin' where id=$1",[member]);await assert.rejects(db.exec(fs.readFileSync('backend/supabase/rename_owner_drgerami.sql','utf8')),/exactly one active admin/);await db.exec('rollback');
 console.log('Dashboard SQL passed: UUID/state preservation, editable profile, verified Auth email sync, safe username change, owner rename guard, protected admin approval, queued signup and server-only notification claims.');
}finally{await db.close()}
