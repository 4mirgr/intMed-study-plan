import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const oldDegrees="('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص')";
const fixture=`create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
create table public.profiles(id uuid primary key,username text,email text,full_name text,degree text,id_number text,phone text,specialty text,province text,approved boolean,rejected boolean,updated_at timestamptz);
create table public.study_state(user_id uuid primary key);`;
const upgrade=fs.readFileSync('backend/supabase/registration_degree_upgrade.sql','utf8');
const insert=(db,id,degree)=>db.query(`insert into auth.users values($1,'qa@example.com',$2::jsonb)`,[id,JSON.stringify({app:'intmed',username:'test_user',fullName:'Test User',degree})]);
for(const source of ['automatic_access.sql','registration_upgrade.sql']){
  const db=new PGlite();await db.exec(fixture);
  const sql=fs.readFileSync('backend/supabase/'+source,'utf8');
  const definition=sql.slice(sql.indexOf('create or replace function public.handle_intmed_user()'),sql.indexOf('$$;',sql.indexOf('create or replace function public.handle_intmed_user()'))+3);
  await db.exec(definition+`create trigger signup after insert on auth.users for each row execute function public.handle_intmed_user();`);
  await insert(db,'11111111-1111-4111-8111-111111111111','سایر');
  assert.deepEqual((await db.query('select degree,approved,rejected from profiles')).rows,[{degree:'سایر',approved:true,rejected:false}]);
  await assert.rejects(()=>insert(db,'22222222-2222-4222-8222-222222222222','invalid-degree'),/Invalid IntMed signup profile/);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,1,'invalid signup must roll back');
  await db.close();
}
// A live installation may have different approval semantics. The additive upgrade
// must retain the entire function body except the degree allowlist and touch no rows.
const db=new PGlite();await db.exec(fixture);
await db.exec(`create function public.handle_intmed_user() returns trigger language plpgsql security definer set search_path=public as $$begin
if new.raw_user_meta_data->>'degree' not in ${oldDegrees} then raise exception 'Invalid IntMed signup profile'; end if;
insert into public.profiles(id,degree,approved,rejected) values(new.id,new.raw_user_meta_data->>'degree',false,true);
return new; end;$$;
create trigger signup after insert on auth.users for each row execute function public.handle_intmed_user();`);
await insert(db,'33333333-3333-4333-8333-333333333333','رزیدنت');
const before=(await db.query('select * from profiles')).rows;
await db.exec(upgrade);await db.exec(upgrade);
assert.deepEqual((await db.query('select * from profiles')).rows,before,'upgrade cannot update existing users');
await insert(db,'44444444-4444-4444-8444-444444444444','سایر');
assert.deepEqual((await db.query("select approved,rejected from profiles where degree='سایر'")).rows,[{approved:false,rejected:true}],'upgrade must preserve live approval behavior');
await assert.rejects(()=>insert(db,'55555555-5555-4555-8555-555555555555','invalid-degree'),/Invalid IntMed signup profile/);
await db.exec(`create or replace function public.handle_intmed_user() returns trigger language plpgsql as $$begin return new;end;$$;`);
await assert.rejects(()=>db.exec(upgrade),/Unexpected IntMed degree validation/);
await db.close();
console.log('Registration degree SQL passed: Other accepted, invalid rejected, upgrade idempotent and existing users/approval behavior preserved.');
