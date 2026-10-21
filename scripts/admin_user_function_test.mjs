import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let handler,manager=true,authUpdate,profileUpdate;
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'public-key'};
const fetchMock=async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(url.includes('/rest/v1/profiles?id=eq.11111111')&&url.includes('select=role'))return Response.json({role:manager?'admin':'user',approved:true,rejected:false});
  if(url.includes('/auth/v1/admin/users/22222222')&&(!options.method||options.method==='GET'))return Response.json({id:'22222222-2222-4222-8222-222222222222',email:'old@example.com',user_metadata:{kept:true}});
  if(url.includes('/rest/v1/profiles?username=')||url.includes('/rest/v1/profiles?email='))return Response.json([]);
  if(url.includes('/auth/v1/admin/users/22222222')&&options.method==='PUT'){authUpdate=JSON.parse(options.body);return Response.json({id:'22222222-2222-4222-8222-222222222222'});}
  if(url.includes('/rest/v1/profiles?id=eq.22222222')&&options.method==='PATCH'){profileUpdate=JSON.parse(options.body);return Response.json([profileUpdate]);}
  throw Error('Unexpected request '+url);
};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Response,Request,JSON,Object,String,Set,Date,RegExp,encodeURIComponent,Error});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-admin-user/index.ts','utf8'),context);
const input={userId:'22222222-2222-4222-8222-222222222222',username:'edited_user',email:'new@example.com',profile:{fullName:'کاربر ویرایش‌شده',degree:'رزیدنت',specialty:'بیماری های داخلی',province:'فارس',idNumber:'123',phone:'09120000000'}};
const send=body=>handler(new Request('https://project.supabase.co/functions/v1/intmed-admin-user',{method:'POST',headers:{origin:'https://drgerami-md.ir',authorization:'Bearer manager-token'},body:JSON.stringify(body)}));
let result=await send(input);assert.equal(result.status,200);assert.equal(authUpdate.email,'new@example.com');assert.equal(authUpdate.email_confirm,true);assert.equal(authUpdate.user_metadata.kept,true);assert.equal(profileUpdate.username,'edited_user');assert.equal(profileUpdate.specialty,'بیماری های داخلی');
result=await send({...input,password:'forbidden'});assert.equal(result.status,400);
manager=false;result=await send(input);assert.equal(result.status,403);
console.log('Admin user function passed: verified admin, all account fields updated, password rejected, non-admin denied.');
