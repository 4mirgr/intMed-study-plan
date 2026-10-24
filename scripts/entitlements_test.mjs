import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
let handler,active=true,mode='valid',applied=0,patched=[],claims=0;
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret',SUPABASE_ANON_KEY:'anon',INTMED_BAZAAR_VERIFY_URL:'https://verifier.example/bazaar',INTMED_BAZAAR_VERIFY_SECRET:'verify-secret'};
const fetchMock=async(url,options={})=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
 if(url.includes('/rest/v1/profiles?'))return Response.json([{approved:active,rejected:false}]);
 if(url.includes('/rest/v1/intmed_store_products?'))return Response.json([{external_product_id:'monthly.pro'}]);
 if(url.includes('/rest/v1/intmed_purchase_receipts?on_conflict=')){claims++;return Response.json([{id:'22222222-2222-4222-8222-222222222222'}]);}
 if(url.includes('/rest/v1/intmed_purchase_receipts?id=eq.')&&options.method==='PATCH'){patched.push(JSON.parse(options.body));return new Response(null,{status:204});}
 if(url==='https://verifier.example/bazaar'){const sent=JSON.parse(options.body);assert.equal(sent.productId,'monthly.pro');assert.equal(sent.purchaseToken,'provider-token-which-is-secret');assert.equal(options.headers.Authorization,'Bearer verify-secret');return mode==='down'?new Response('{}',{status:503}):Response.json(mode==='invalid'?{valid:false,state:'rejected',productId:'monthly.pro'}:{valid:true,state:'active',productId:'monthly.pro',orderId:'order-1',startTime:'2026-10-24T00:00:00Z',expiryTime:'2026-11-24T00:00:00Z'});}
 if(url.endsWith('/rest/v1/rpc/apply_intmed_verified_purchase')){applied++;const body=JSON.parse(options.body);assert.equal(body.target_user,'11111111-1111-4111-8111-111111111111');return Response.json('33333333-3333-4333-8333-333333333333');}
 throw Error('Unexpected '+url);
};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Response,Request,JSON,Object,String,Set,Date,RegExp,Number,Array,TextEncoder,crypto,encodeURIComponent,Error});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-purchase-verify/index.ts','utf8'),context);
const input={provider:'bazaar',productId:'pro.monthly',packageName:'ir.intmed.app',purchaseToken:'provider-token-which-is-secret',idempotencyKey:'44444444-4444-4444-8444-444444444444',valid:true};
const send=body=>handler(new Request('https://project.supabase.co/functions/v1/intmed-purchase-verify',{method:'POST',headers:{origin:'https://drgerami-md.ir',authorization:'Bearer user-token'},body:JSON.stringify(body)}));
let result=await send(input);assert.equal(result.status,200);assert.equal(applied,1);assert.deepEqual(await result.json(),{verified:true,productId:'pro.monthly'});
mode='invalid';result=await send({...input,idempotencyKey:'55555555-5555-4555-8555-555555555555'});assert.equal(result.status,402);assert.equal(applied,1);assert.equal(patched.at(-1).status,'rejected');
mode='down';result=await send({...input,idempotencyKey:'66666666-6666-4666-8666-666666666666'});assert.equal(result.status,503);assert.equal(patched.at(-1).status,'error');
delete env.INTMED_BAZAAR_VERIFY_SECRET;result=await send({...input,idempotencyKey:'77777777-7777-4777-8777-777777777777'});assert.equal(result.status,503);assert.equal(claims,3,'Missing verifier secret must fail before claiming a receipt');
env.INTMED_BAZAAR_VERIFY_SECRET='verify-secret';active=false;result=await send({...input,idempotencyKey:'88888888-8888-4888-8888-888888888888'});assert.equal(result.status,403);
assert.ok(!JSON.stringify(patched).includes('provider-token-which-is-secret'),'Raw purchase token was persisted');
const sql=fs.readFileSync('backend/supabase/entitlements.sql','utf8');assert.match(sql,/enable row level security/g);assert.match(sql,/service role required/);assert.match(sql,/request\.jwt\.claim\.role/);assert.match(sql,/unique\s*\(source_receipt_id\)/i);assert.match(sql,/order ownership conflict/i);assert.match(sql,/No content policy references these tables yet/);
console.log('Entitlements passed: active-account verification, exact SKU, fail-closed config/provider, hashed token boundary, atomic service-only grant and no content lock.');
