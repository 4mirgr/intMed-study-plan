import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111',otherAdmin='22222222-2222-4222-8222-222222222222',victim='33333333-3333-4333-8333-333333333333',member='44444444-4444-4444-8444-444444444444';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to authenticated,anon;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
 await db.exec(fs.readFileSync('backend/supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 await db.exec(fs.readFileSync('backend/supabase/registration_upgrade.sql','utf8'));
 await db.exec(fs.readFileSync('backend/supabase/delete_user.sql','utf8'));
 // Installation is repeatable and does not remove accounts.
 await db.exec(fs.readFileSync('backend/supabase/delete_user.sql','utf8'));
 for(const [id,username] of [[owner,'owner'],[otherAdmin,'admin2'],[victim,'victim'],[member,'member']]){
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,username+'@example.com',JSON.stringify({username})]);
 }
 await db.query("update public.profiles set approved=true, role=case when id=any($1::uuid[]) then 'admin' else 'user' end",[[owner,otherAdmin]]);
 await db.query("insert into public.tickets(id,user_id,payload) values('victim-ticket',$1,'{}'),('member-ticket',$2,'{}')",[victim,member]);
 async function asUser(id,role='authenticated'){
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);
 }
 const count=async(table,id,column='user_id')=>(await db.query(`select count(*)::int as n from ${table} where ${column}=$1`,[id])).rows[0].n;
 await asUser('', 'anon');await assert.rejects(db.query('select public.delete_intmed_user($1)',[victim]),/permission denied/);
 await asUser(member);await assert.rejects(db.query('select public.delete_intmed_user($1)',[victim]),/admin required/);
 await asUser(owner);await assert.rejects(db.query('select public.delete_intmed_user($1)',[owner]),/own account/);
 await assert.rejects(db.query('select public.delete_intmed_user($1)',[otherAdmin]),/administrator/);
 await db.exec('reset role');await db.query('update public.profiles set rejected=true where id=$1',[owner]);
 await asUser(owner);await assert.rejects(db.query('select public.delete_intmed_user($1)',[victim]),/admin required/);
 await db.exec('reset role');await db.query('update public.profiles set rejected=false where id=$1',[owner]);
 // A failure in any delete must roll back all preceding deletes in this RPC.
 await db.exec(`create function public.test_block_delete() returns trigger language plpgsql as $$ begin raise exception 'test blocked deletion'; end; $$;
 create trigger test_block_delete before delete on public.profiles for each row execute function public.test_block_delete();`);
 await asUser(owner);await assert.rejects(db.query('select public.delete_intmed_user($1)',[victim]),/test blocked deletion/);
 await db.exec('reset role');assert.equal(await count('public.study_state',victim),1);assert.equal(await count('public.tickets',victim),1);
 await db.exec('drop trigger test_block_delete on public.profiles');
 await asUser(owner);await db.query('select public.delete_intmed_user($1)',[victim]);
 await db.exec('reset role');
 for(const [table,column] of [['public.profiles','id'],['public.study_state','user_id'],['public.tickets','user_id']]){
  assert.equal(await count(table,victim,column),0);assert.equal(await count(table,member,column),1);
 }
 assert.equal(await count('auth.users',victim,'id'),1,'Shared Auth identity must remain');
 await asUser(owner);
 await assert.rejects(db.query("insert into public.tickets(id,user_id) values('stale-ticket',$1)",[victim]),/row-level security/);
 await assert.rejects(db.query('insert into public.study_state(user_id) values($1)',[victim]),/row-level security/);
 await assert.rejects(db.query("update public.tickets set user_id=$1 where id='member-ticket'",[victim]),/row-level security/);
 await db.query('select public.delete_intmed_user($1)',[victim]);
 await asUser(victim);assert.equal((await db.query('select * from public.study_state')).rows.length,0);
 console.log('Deletion SQL passed: admin-only, self/admin protected, atomic rollback, IntMed data removed, other users/shared Auth preserved, stale writes denied.');
}finally{await db.close()}
