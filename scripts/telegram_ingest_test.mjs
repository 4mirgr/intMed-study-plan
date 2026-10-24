import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto,randomUUID} from 'node:crypto';
let handler,rows=[],messages=[],stored=0,getFiles=0,downloadBytes=new TextEncoder().encode('%PDF-1.7 synthetic');
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-only',TELEGRAM_BOT_TOKEN:'bot-secret',TELEGRAM_WEBHOOK_SECRET:'webhook-secret'};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:k=>env[k]}},Response,Request,URL,TextEncoder,crypto:{subtle:webcrypto.subtle,randomUUID},Date,fetch:async(url,options={})=>{
 if(url.includes('/intmed_notification_settings'))return Response.json([{chat_id:'123'}]);
 if(url.includes('/intmed_content_ingest')){
  if(options.method==='POST'){rows.push(JSON.parse(options.body));return new Response(null,{status:204});}
  if(options.method==='PATCH'){Object.assign(rows.find(r=>url.includes('id=eq.'+r.id)),JSON.parse(options.body));return new Response(null,{status:204});}
  const update=/telegram_update_id=eq.(\d+)/.exec(url);if(update)return Response.json(rows.filter(r=>r.telegram_update_id===Number(update[1])).map(r=>({id:r.id,status:r.status})));
  if(url.includes('created_at=gte.'))return Response.json(rows.slice(-13).map(r=>({id:r.id})));
  if(url.includes('status=in.'))return Response.json(rows.map(r=>({status:r.status})));
 }
 if(url.includes('/getFile')){getFiles++;return Response.json({ok:true,result:{file_path:'documents/source.pdf'}});}
 if(url.includes('/sendMessage')){messages.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:9}});}
 if(url.includes('/file/bot'))return new Response(downloadBytes,{headers:{'content-length':String(downloadBytes.length)}});
 if(url.includes('/storage/v1/object/')){stored++;assert.equal(options.headers['x-upsert'],'false');return Response.json({Key:'private'});}
 throw Error('unexpected '+url);
}});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-telegram-bot/index.ts','utf8'),context);
const update=(id,chat='123',extra={})=>({update_id:id,message:{message_id:id,chat:{id:chat,type:'private'},...extra}});
const post=(body,secret='webhook-secret')=>handler(new Request('https://test/functions/v1/intmed-telegram-bot',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(body)}));

let r=await post(update(1,'999',{text:'forwarded secret',forward_origin:{type:'hidden_user',sender_user_name:'Hidden',date:1700000000}}));assert.equal(r.status,200);assert.equal(rows.length,0);assert.equal(messages.length,0,'unconfigured chat received response');
r=await post(update(2,'123',{text:'/help'}),'wrong');assert.equal(r.status,403);
r=await post(update(3,'123',{text:'/start'}));assert.equal(r.status,200);assert.ok(messages.at(-1).text.includes('Forward'));

const doc={file_id:'file-1',file_unique_id:'unique-1',file_name:'فصل ریه.pdf',mime_type:'application/pdf',file_size:downloadBytes.length};
r=await post(update(4,'123',{caption:'/topic heme-lung-cancer',document:doc,forward_origin:{type:'channel',chat:{id:-100123,title:'کانال آموزشی',username:'Med_Channel'},message_id:88,date:1700000000}}));
assert.equal(r.status,200);assert.equal((await r.json()).queued,true);assert.equal(rows.length,1);assert.equal(rows[0].status,'pending_review');assert.equal(rows[0].suggested_topic_id,'heme-lung-cancer');assert.equal(rows[0].is_forwarded,true);assert.equal(rows[0].source_type,'channel');assert.equal(rows[0].source_name,'کانال آموزشی');assert.equal(rows[0].source_username,'Med_Channel');assert.equal(rows[0].source_message_id,88);assert.ok(!('source_chat_id' in rows[0]),'Sensitive source chat id was persisted');assert.equal(stored,1);assert.match(rows[0].sha256,/^[a-f0-9]{64}$/);
r=await post(update(4,'123',{caption:'/topic heme-lung-cancer',document:doc}));assert.equal((await r.json()).duplicate,true);assert.equal(stored,1);assert.equal(getFiles,1);

r=await post(update(5,'123',{text:'متن علمی فورواردشده #cardio-ecg',forward_origin:{type:'hidden_user',sender_user_name:'نام پنهان',date:1700000100}}));
assert.equal((await r.json()).kind,'text');assert.equal(rows[1].kind,'text');assert.equal(rows[1].status,'pending_review');assert.equal(rows[1].storage_path,null);assert.equal(rows[1].telegram_file_id,null);assert.equal(rows[1].source_type,'hidden_user');assert.equal(rows[1].source_name,'نام پنهان');assert.equal(rows[1].suggested_topic_id,'cardio-ecg');assert.match(rows[1].sha256,/^[a-f0-9]{64}$/);
r=await post(update(5,'123',{text:'duplicate'}));assert.equal((await r.json()).duplicate,true);assert.equal(rows.length,2);

r=await post(update(6,'123',{text:'legacy forward',forward_from:{id:777,first_name:'Old',last_name:'Sender',username:'old_sender'},forward_date:1700000200}));assert.equal((await r.json()).queued,true);assert.equal(rows[2].source_type,'user');assert.equal(rows[2].source_name,'Old Sender');assert.equal(rows[2].source_username,'old_sender');assert.ok(!JSON.stringify(rows[2]).includes('777'),'Forwarded personal id leaked into provenance');
r=await post(update(7,'123',{text:'modern chat forward',forward_origin:{type:'chat',sender_chat:{id:-999,title:'گروه علمی',username:'science_group'},date:1700000300}}));assert.equal((await r.json()).queued,true);assert.equal(rows[3].source_type,'chat');assert.equal(rows[3].source_name,'گروه علمی');assert.equal(rows[3].source_username,'science_group');assert.ok(!JSON.stringify(rows[3]).includes('-999'));
r=await post(update(8,'123',{document:{...doc,file_id:'bad-type',mime_type:'application/x-msdownload'}}));assert.equal((await r.json()).rejected,true);

downloadBytes=new TextEncoder().encode('not a png');
r=await post(update(9,'123',{document:{...doc,file_id:'spoof',file_name:'spoof.png',mime_type:'image/png',file_size:downloadBytes.length}}));assert.equal((await r.json()).queued,false);assert.equal(rows.at(-1).status,'error');assert.equal(stored,1,'Spoofed MIME reached storage');
downloadBytes=new TextEncoder().encode('%PDF-1.7 synthetic');

r=await post(update(10,'123',{text:'/status'}));assert.ok(messages.at(-1).text.includes('در انتظار بازبینی'));
while(rows.length<12)rows.push({...rows[0],id:randomUUID(),telegram_update_id:100+rows.length});
r=await post(update(11,'123',{document:{...doc,file_id:'rate'}}));assert.equal((await r.json()).rateLimited,true);assert.equal(stored,1);
assert.ok(rows.every(row=>row.status!=='accepted'),'ingest auto-published content');
console.log('Telegram ingest passed: webhook/chat authorization, forwarded text/files, privacy-safe provenance, MIME signatures, quarantine, topic hints, rate limit and idempotency.');
