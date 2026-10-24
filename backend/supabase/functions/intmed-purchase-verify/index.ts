const SITE='https://drgerami-md.ir';
const allowed=new Set([SITE,'https://www.drgerami-md.ir','http://127.0.0.1:8765','http://localhost:8765']);
const enc=new TextEncoder();
const hex=async(value)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.has(origin)?origin:SITE,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||(origin&&!allowed.has(origin)))return reply(403,{message:'Forbidden'});
 if(Number(req.headers.get('content-length')||0)>8192)return reply(413,{message:'Request too large'});
 const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!base||!service||!anon)return reply(503,{message:'سرویس خرید هنوز راه‌اندازی نشده است.'});
 const bearer=req.headers.get('authorization')||'';if(!bearer.startsWith('Bearer '))return reply(401,{message:'Unauthorized'});
 const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:bearer}});if(!auth.ok)return reply(401,{message:'Unauthorized'});const user=await auth.json();
 const server={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 const profileResponse=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=approved,rejected&limit=1',{headers:server});const profiles=profileResponse.ok?await profileResponse.json():[];
 if(profiles.length!==1||profiles[0].approved!==true||profiles[0].rejected===true)return reply(403,{message:'حساب فعال نیست.'});
 let body;try{const raw=await req.text();if(raw.length>8192)return reply(413,{message:'Request too large'});body=JSON.parse(raw);}catch{return reply(400,{message:'درخواست معتبر نیست.'});}
 const provider=String(body.provider||''),productId=String(body.productId||''),packageName=String(body.packageName||''),purchaseToken=String(body.purchaseToken||''),idempotencyKey=String(body.idempotencyKey||'');
 if(!['bazaar','myket'].includes(provider)||!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(productId)||packageName.length<3||packageName.length>220||purchaseToken.length<20||purchaseToken.length>4096||!/^[0-9a-f-]{36}$/i.test(idempotencyKey))return reply(400,{message:'اطلاعات خرید معتبر نیست.'});
 const prefix=provider==='bazaar'?'BAZAAR':'MYKET',verifyUrl=Deno.env.get('INTMED_'+prefix+'_VERIFY_URL'),verifySecret=Deno.env.get('INTMED_'+prefix+'_VERIFY_SECRET');
 if(!verifyUrl||!verifySecret||!/^https:\/\//.test(verifyUrl))return reply(503,{message:'اعتبارسنجی این فروشگاه هنوز پیکربندی نشده است.'});
 const mapsUrl=base+'/rest/v1/intmed_store_products?provider=eq.'+provider+'&product_id=eq.'+encodeURIComponent(productId)+'&package_name=eq.'+encodeURIComponent(packageName)+'&active=eq.true&select=external_product_id&limit=1';
 const mappedResponse=await fetch(mapsUrl,{headers:server}),mapped=mappedResponse.ok?await mappedResponse.json():[];if(mapped.length!==1)return reply(400,{message:'محصول فروشگاهی معتبر نیست.'});const externalProductId=mapped[0].external_product_id;
 const tokenHash=await hex(provider+'\n'+purchaseToken),claim=await fetch(base+'/rest/v1/intmed_purchase_receipts?on_conflict=user_id,idempotency_key',{method:'POST',headers:{...server,Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({user_id:user.id,provider,product_id:productId,external_product_id:externalProductId,package_name:packageName,token_hash:tokenHash,idempotency_key:idempotencyKey,status:'pending'})});
 if(!claim.ok)return reply(409,{message:'این رسید قبلاً برای حساب دیگری ثبت شده یا قابل پردازش نیست.'});const claimed=await claim.json();
 if(!claimed.length){const oldResponse=await fetch(base+'/rest/v1/intmed_purchase_receipts?user_id=eq.'+encodeURIComponent(user.id)+'&idempotency_key=eq.'+encodeURIComponent(idempotencyKey)+'&select=id,status&limit=1',{headers:server}),old=oldResponse.ok?await oldResponse.json():[];return old.length?reply(200,{duplicate:true,status:old[0].status}):reply(409,{message:'درخواست تکراری یا نامعتبر است.'});}
 const receipt=claimed[0];let checked;
 try{const response=await fetch(verifyUrl,{method:'POST',headers:{Authorization:'Bearer '+verifySecret,'Content-Type':'application/json'},body:JSON.stringify({provider,packageName,productId:externalProductId,purchaseToken})});checked=await response.json();if(!response.ok)throw Error('provider');}catch{await fetch(base+'/rest/v1/intmed_purchase_receipts?id=eq.'+receipt.id,{method:'PATCH',headers:{...server,Prefer:'return=minimal'},body:JSON.stringify({status:'error',failure_code:'provider_unavailable',updated_at:new Date().toISOString()})});return reply(503,{message:'استعلام فروشگاه انجام نشد؛ کمی بعد دوباره امتحان کنید.'});}
 const valid=checked&&checked.valid===true&&String(checked.productId||'')===externalProductId&&String(checked.orderId||'').length>0&&['purchased','active'].includes(String(checked.state||''));
 if(!valid){await fetch(base+'/rest/v1/intmed_purchase_receipts?id=eq.'+receipt.id,{method:'PATCH',headers:{...server,Prefer:'return=minimal'},body:JSON.stringify({status:'rejected',failure_code:'provider_rejected',updated_at:new Date().toISOString()})});return reply(402,{message:'رسید خرید توسط فروشگاه تأیید نشد.'});}
 const start=new Date(checked.startTime||Date.now()),expiry=checked.expiryTime?new Date(checked.expiryTime):null;if(!Number.isFinite(start.getTime())||(expiry&&!Number.isFinite(expiry.getTime())))return reply(502,{message:'پاسخ فروشگاه قابل پردازش نیست.'});
 const applied=await fetch(base+'/rest/v1/rpc/apply_intmed_verified_purchase',{method:'POST',headers:{...server,Prefer:'return=representation'},body:JSON.stringify({target_receipt:receipt.id,target_user:user.id,verified_order_id:String(checked.orderId),verified_start:start.toISOString(),verified_expiry:expiry?expiry.toISOString():null})});
 if(!applied.ok)return reply(503,{message:'ثبت دسترسی خریداری‌شده انجام نشد.'});
 return reply(200,{verified:true,productId});
});
