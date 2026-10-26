import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto,randomUUID} from 'node:crypto';
let handler,rows=[],messages=[],stored=0,getFiles=0,workerCalls=0,downloadBytes=new TextEncoder().encode('%PDF-1.7 synthetic');
const sessions=new Map(),hints=[],alerts=[],drafts=[];
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-only',SUPABASE_ANON_KEY:'public-only',TELEGRAM_BOT_TOKEN:'bot-secret',TELEGRAM_WEBHOOK_SECRET:'webhook-secret'};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:k=>env[k]}},Response,Request,URL,TextEncoder,crypto:{subtle:webcrypto.subtle,randomUUID},Date,fetch:async(url,options={})=>{
 if(url.endsWith('/auth/v1/user'))return options.headers.Authorization==='Bearer valid-user-jwt'?Response.json({id:'user-1',email:'private@example.com'}):new Response(null,{status:401});
 if(url.includes('/intmed_notification_settings'))return Response.json([{chat_id:'123'}]);
 if(url.includes('/profiles?id=eq.user-1'))return Response.json([{id:'user-1',username:'learner',full_name:'کاربر آزمایشی',approved:true,rejected:false}]);
 if(url.includes('/study_state?user_id=eq.user-1'))return Response.json([{state:{itemState:{'activity:infectious-encephalitis:2026-10-25':{seconds:1200},'activity:heme-iron-anemia:2026-10-25':{seconds:600},unrelated:{seconds:99999}}}}]);
 if(url.includes('/intmed_messages?sender_id=eq.user-1'))return Response.json([{id:'message-1',body:'لطفاً پاسخ این پیام را بدهید.',conversation_id:'conversation-1',created_at:'2026-10-25T10:00:00Z'}]);
 if(url.includes('/intmed_bot_sessions')){
  const chat=decodeURIComponent((/chat_id=eq.([^&]+)/.exec(url)||[])[1]||'');
  if(options.method==='POST'){const body=JSON.parse(options.body);sessions.set(String(body.chat_id),{mode:body.mode,topic_hint:body.topic_hint});return new Response(null,{status:204});}
  return Response.json(sessions.has(chat)?[sessions.get(chat)]:[]);
 }
 if(url.includes('/intmed_bot_topic_hints')){hints.push(JSON.parse(options.body));return new Response(null,{status:204});}
 if(url.includes('/intmed_content_drafts')){
  if(options.method==='PATCH'){const body=JSON.parse(options.body);drafts.filter(item=>url.includes('ingest_id=eq.'+item.ingest_id)).forEach(item=>Object.assign(item,body));return new Response(null,{status:204});}
  return Response.json(drafts.filter(item=>['error','waiting_provider'].includes(item.status)&&['provider_429','provider_rate_limited'].includes(item.error_code)).map(item=>({ingest_id:item.ingest_id})));
 }
 if(url.includes('/rpc/claim_intmed_telegram_alert'))return Response.json(true);
 if(url.includes('/intmed_telegram_alerts')){
  if(options.method==='POST'){const body=JSON.parse(options.body);if(alerts.some(item=>item.dedupe_key===body.dedupe_key))return Response.json([]);const item={id:randomUUID(),...body};alerts.push(item);return Response.json([item]);}
  if(options.method==='PATCH'){Object.assign(alerts.find(item=>url.includes('id=eq.'+item.id)),JSON.parse(options.body));return new Response(null,{status:204});}
  return Response.json(alerts.filter(item=>['pending','error','processing'].includes(item.status)));
 }
 if(url.includes('/intmed_content_ingest')){
  if(options.method==='POST'){rows.push(JSON.parse(options.body));return new Response(null,{status:204});}
  if(options.method==='PATCH'){Object.assign(rows.find(r=>url.includes('id=eq.'+r.id)),JSON.parse(options.body));return new Response(null,{status:204});}
  const update=/telegram_update_id=eq.(\d+)/.exec(url);if(update)return Response.json(rows.filter(r=>r.telegram_update_id===Number(update[1])).map(r=>({id:r.id,status:r.status})));
  if(url.includes('status=in.(quarantined,pending_review,processing)&select=id'))return Response.json(rows.filter(r=>['quarantined','pending_review','processing'].includes(r.status)).slice(0,31).map(r=>({id:r.id})));
  if(url.includes('status=in.'))return Response.json(rows.map(r=>({status:r.status})));
 }
 if(url.includes('/getFile')){getFiles++;return Response.json({ok:true,result:{file_path:'documents/source.pdf'}});}
 if(url.includes('/sendMessage')){messages.push(JSON.parse(options.body));return Response.json({ok:true,result:{message_id:9}});}
 if(url.includes('/setWebhook'))return Response.json({ok:true,result:true});
 if(url.includes('/answerCallbackQuery'))return Response.json({ok:true,result:true});
 if(url.includes('/file/bot'))return new Response(downloadBytes,{headers:{'content-length':String(downloadBytes.length)}});
 if(url.includes('/storage/v1/object/')){stored++;assert.equal(options.headers['x-upsert'],'false');return Response.json({Key:'private'});}
 if(url.includes('/functions/v1/intmed-content-worker')){workerCalls++;return Response.json({processed:0});}
 throw Error('unexpected '+url);
}});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-telegram-bot/index.ts','utf8'),context);
const update=(id,chat='123',extra={})=>({update_id:id,message:{message_id:id,chat:{id:chat,type:'private'},...extra}});
const post=(body,secret='webhook-secret')=>handler(new Request('https://test/functions/v1/intmed-telegram-bot',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify(body)}));

let r=await post(update(1,'999',{text:'forwarded secret',forward_origin:{type:'hidden_user',sender_user_name:'Hidden',date:1700000000}}));assert.equal(r.status,200);assert.equal(rows.length,0);assert.equal(messages.length,0,'unconfigured chat received response');
r=await post(update(2,'123',{text:'/help'}),'wrong');assert.equal(r.status,403,'An invalid Telegram secret must be rejected before any user-event handling');
r=await post(update(3,'123',{text:'/start'}));assert.equal(r.status,200);assert.ok(messages.at(-1).text.includes('Forward'));
assert.match(messages.at(-1).text,/پردازش هوشمند خودکار فعلاً خاموش است/);assert.equal(workerCalls,0,'/start must not wake the content worker');
const menuButtons=messages.at(-1).reply_markup.inline_keyboard.flat();
assert.deepEqual(menuButtons.map(button=>button.callback_data),['menu:status','topic:set','queue:retry','menu:help']);

r=await post({update_id:31,callback_query:{id:'callback-1',data:'topic:set',message:{message_id:31,chat:{id:'123',type:'private'}}}});assert.equal(r.status,200);assert.equal(sessions.get('123').mode,'awaiting_topic_hint');
r=await post(update(32,'123',{text:'عفونی، مننژیت و انسفالیت'}));assert.equal((await r.json()).topicHint,true);assert.equal(sessions.get('123').topic_hint,'عفونی، مننژیت و انسفالیت');
r=await post(update(33,'123',{text:'متن علمی برای فصل عفونی'}));assert.equal((await r.json()).queued,true);assert.equal(hints.at(-1).hint_text,'عفونی، مننژیت و انسفالیت');assert.equal(sessions.get('123').topic_hint,null,'Free-form topic hint must be consumed exactly once');

const doc={file_id:'file-1',file_unique_id:'unique-1',file_name:'فصل ریه.pdf',mime_type:'application/pdf',file_size:downloadBytes.length};
r=await post(update(4,'123',{caption:'/topic heme-lung-cancer',document:doc,forward_origin:{type:'channel',chat:{id:-100123,title:'کانال آموزشی',username:'Med_Channel'},message_id:88,date:1700000000}}));
assert.equal(r.status,200);assert.equal((await r.json()).queued,true);assert.equal(rows.length,2);assert.equal(rows[1].status,'pending_review');assert.equal(rows[1].suggested_topic_id,'heme-lung-cancer');assert.equal(rows[1].is_forwarded,true);assert.equal(rows[1].source_type,'channel');assert.equal(rows[1].source_name,'کانال آموزشی');assert.equal(rows[1].source_username,'Med_Channel');assert.equal(rows[1].source_message_id,88);assert.ok(!('source_chat_id' in rows[1]),'Sensitive source chat id was persisted');assert.equal(stored,1);assert.match(rows[1].sha256,/^[a-f0-9]{64}$/);
r=await post(update(4,'123',{caption:'/topic heme-lung-cancer',document:doc}));assert.equal((await r.json()).duplicate,true);assert.equal(stored,1);assert.equal(getFiles,1);

r=await post(update(5,'123',{text:'متن علمی فورواردشده #cardio-ecg',forward_origin:{type:'hidden_user',sender_user_name:'نام پنهان',date:1700000100}}));
assert.equal((await r.json()).kind,'text');assert.equal(rows[2].kind,'text');assert.equal(rows[2].status,'pending_review');assert.equal(rows[2].storage_path,null);assert.equal(rows[2].telegram_file_id,null);assert.equal(rows[2].source_type,'hidden_user');assert.equal(rows[2].source_name,'نام پنهان');assert.equal(rows[2].suggested_topic_id,'cardio-ecg');assert.match(rows[2].sha256,/^[a-f0-9]{64}$/);
r=await post(update(5,'123',{text:'duplicate'}));assert.equal((await r.json()).duplicate,true);assert.equal(rows.length,3);

r=await post(update(6,'123',{text:'legacy forward',forward_from:{id:777,first_name:'Old',last_name:'Sender',username:'old_sender'},forward_date:1700000200}));assert.equal((await r.json()).queued,true);assert.equal(rows[3].source_type,'user');assert.equal(rows[3].source_name,'Old Sender');assert.equal(rows[3].source_username,'old_sender');assert.ok(!JSON.stringify(rows[3]).includes('777'),'Forwarded personal id leaked into provenance');
r=await post(update(7,'123',{text:'modern chat forward',forward_origin:{type:'chat',sender_chat:{id:-999,title:'گروه علمی',username:'science_group'},date:1700000300}}));assert.equal((await r.json()).queued,true);assert.equal(rows[4].source_type,'chat');assert.equal(rows[4].source_name,'گروه علمی');assert.equal(rows[4].source_username,'science_group');assert.ok(!JSON.stringify(rows[4]).includes('-999'));
r=await post(update(8,'123',{document:{...doc,file_id:'bad-type',mime_type:'application/x-msdownload'}}));assert.equal((await r.json()).rejected,true);

downloadBytes=new TextEncoder().encode('not a png');
r=await post(update(9,'123',{document:{...doc,file_id:'spoof',file_name:'spoof.png',mime_type:'image/png',file_size:downloadBytes.length}}));assert.equal((await r.json()).queued,false);assert.equal(rows.at(-1).status,'error');assert.equal(stored,1,'Spoofed MIME reached storage');
downloadBytes=new TextEncoder().encode('%PDF-1.7 synthetic');

r=await post({update_id:34,callback_query:{id:'callback-2',data:'menu:status',message:{message_id:34,chat:{id:'123',type:'private'}}}});assert.ok(messages.at(-1).text.includes('در صف تحلیل یا بازبینی'));
assert.match(messages.at(-1).text,/حالت پردازش: دستی/);
while(rows.filter(row=>['quarantined','pending_review','processing'].includes(row.status)).length<30)rows.push({...rows[0],id:randomUUID(),telegram_update_id:100+rows.length,status:'pending_review'});
r=await post(update(11,'123',{document:{...doc,file_id:'rate'}}));assert.equal((await r.json()).rateLimited,true);assert.equal(stored,1);
assert.ok(rows.every(row=>row.status!=='accepted'),'ingest auto-published content');

const retryId=randomUUID();drafts.push({ingest_id:retryId,status:'error',error_code:'provider_429'});rows.push({...rows[0],id:retryId,status:'error',error_code:'worker_failed'});
r=await post({update_id:35,callback_query:{id:'callback-3',data:'queue:retry',message:{message_id:35,chat:{id:'123',type:'private'}}}});assert.deepEqual(await r.json(),{ok:true,command:'retry',queued:0,manual:true});assert.equal(drafts.at(-1).status,'error');assert.equal(rows.at(-1).status,'error');assert.equal(workerCalls,0);

const userEvent=body=>handler(new Request('https://test/functions/v1/intmed-telegram-bot',{method:'POST',headers:{Authorization:'Bearer valid-user-jwt'},body:JSON.stringify(body)}));
r=await userEvent({event:'login'});assert.equal((await r.json()).sent,true);assert.match(messages.at(-1).text,/ورود کاربر/);assert.ok(!messages.at(-1).text.includes('private@example.com'),'Email leaked into login notification');
r=await userEvent({event:'activity'});assert.equal((await r.json()).sent,true);assert.match(messages.at(-1).text,/۳۰ دقیقه/);assert.match(messages.at(-1).text,/infectious-encephalitis/);assert.ok(!messages.at(-1).text.includes('99999'),'Unrelated client state leaked into activity summary');
r=await userEvent({event:'message'});assert.equal((await r.json()).sent,true);const messageNotice=messages.at(-1);assert.match(messageNotice.text,/پیام تازه/);assert.equal(messageNotice.reply_markup.inline_keyboard[0][0].text,'مشاهده پیام‌ها');assert.equal(messageNotice.reply_markup.inline_keyboard[0][1].callback_data,'menu:status');
assert.ok(!JSON.stringify(messages).includes(env.SUPABASE_SERVICE_ROLE_KEY));assert.ok(!JSON.stringify(messages).includes(env.TELEGRAM_BOT_TOKEN));
console.log('Telegram passed: authorized ingest/forwarding, inline menu, Persian topic-hint state, privacy-safe activity/login/message alerts, quarantine, rate limit and idempotency.');
