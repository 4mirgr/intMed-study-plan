import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
let handler,admin=true,telegramOK=true,claims=0,deliveries=0,status='pending',chatId='123',app='intmed';const calls=[];
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-key',SUPABASE_ANON_KEY:'public-key',TELEGRAM_BOT_TOKEN:'synthetic-bot-token',TELEGRAM_WEBHOOK_SECRET:'webhook-secret'};
const uid='33333333-3333-4333-8333-333333333333';
const context=vm.createContext({Deno:{serve:fn=>{handler=fn},env:{get:key=>env[key]}},Response,Map,fetch:async(url,options={})=>{
 calls.push({url,options});
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'admin'});
 if(url.includes('/auth/v1/admin/users/'))return Response.json({user_metadata:{app}});
 if(url.includes('/profiles?id=eq.admin'))return Response.json([{role:admin?'admin':'user',approved:true,rejected:false}]);
 if(url.includes('/profiles?id=eq.'))return Response.json([{id:uid,username:'new_member',approved:false,rejected:false}]);
 if(url.includes('/intmed_notification_settings')){if(options.method==='PATCH'){chatId=JSON.parse(options.body).chat_id;return new Response(null,{status:204});}return Response.json([{chat_id:chatId}]);}
 if(url.includes('/rpc/claim_intmed_signup_alert')){claims++;if(status==='sent'||status==='processing')return Response.json(false);status='processing';return Response.json(true);}
 if(url.includes('/intmed_signup_alerts')){if(options.method==='PATCH'){status=JSON.parse(options.body).status;return new Response(null,{status:204});}return Response.json([{user_id:uid,status}]);}
 if(url.includes('/sendMessage')){deliveries++;const body=JSON.parse(options.body);assert.ok(!body.text.includes('@example.com'));return Response.json({ok:telegramOK,result:{message_id:1}},{status:telegramOK?200:500});}
 if(url.includes('/getUpdates'))return Response.json({ok:true,result:[{message:{chat:{id:123,type:'private',first_name:'Owner'}}}]});
 if(url.includes('/setWebhook')){const body=JSON.parse(options.body);assert.ok(body.url.endsWith('/functions/v1/intmed-telegram-bot'));assert.equal(body.secret_token,'webhook-secret');return Response.json({ok:true,result:true});}
 throw Error('Unexpected request '+url);
}});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-signup-notify/index.ts','utf8'),context);
const post=body=>handler(new Request('https://test.supabase.co/functions/v1/intmed-signup-notify',{method:'POST',headers:{Authorization:'Bearer user-jwt',Origin:'https://drgerami-md.ir'},body:JSON.stringify(body)}));
const event={type:'INSERT',schema:'public',table:'profiles',record:{id:uid}};
let response=await post(event);assert.equal(response.status,200);assert.equal(status,'sent');assert.equal(deliveries,1);
await post(event);assert.equal(deliveries,1,'Duplicate event sent twice');
app='another-app';status='pending';await post(event);assert.equal(deliveries,1,'Other app triggered notification');app='intmed';
admin=false;response=await post({action:'test'});assert.equal(response.status,403);assert.equal(deliveries,1);
admin=true;response=await post({action:'discover'});assert.equal((await response.json()).chats[0].id,'123');
response=await post({action:'connect',chatId:'999'});assert.equal(response.status,400);assert.equal(chatId,'123');
response=await post({action:'connect',chatId:'123'});assert.equal(response.status,200);
response=await post({action:'webhook'});assert.equal(response.status,200);assert.equal((await response.json()).configured,true);
telegramOK=false;status='pending';response=await post(event);assert.equal(response.status,503);assert.equal(status,'error');assert.ok(!(await response.text()).includes(env.TELEGRAM_BOT_TOKEN));
telegramOK=true;response=await post({action:'retry'});assert.equal(response.status,200);assert.equal(status,'sent');
assert.ok(calls.filter(c=>c.url.includes('/rest/v1/')).every(c=>c.options.headers.apikey==='server-only-key'));
console.log('Signup notification passed: real pending IntMed identity check, deduplication, no contact data sent, admin-only setup/test, verified chat discovery, retry and secret-safe failure.');
