import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';

const source=stripTypeScriptTypes(fs.readFileSync('backend/supabase/functions/intmed-content-publisher/index.ts','utf8'));
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const publication='c'.repeat(40),oldPin='a'.repeat(40),ausPin='d'.repeat(40);
async function harness({hostWrite=200,diverged=false}={}){
  let handler,dispatches=[],hostWrites=[],tokens=[],rows=ids.map(id=>({id,title:'Reviewed content',topic_id:'cardio-ph',status:'publish_requested',publishing_runner:null}));
  let host={intmed:{repository:'https://github.com/4mirgr/intMed-study-plan.git',commit:oldPin,mount:'intmed'},aus:{commit:ausPin},extra:{preserve:true}};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',INTMED_GITHUB_ACTIONS_TOKEN:'private-pat'};
  const fetchMock=async(url,options={})=>{
    if(url.includes('/rest/v1/rpc/claim_intmed_publication')){
      if(rows.some(row=>row.status==='publishing'))return Response.json(null);
      const row=rows.find(row=>row.status==='publish_requested');if(!row)return Response.json(null);
      Object.assign(row,{status:'publishing',publishing_runner:'github-actions'});return Response.json({id:row.id,title:row.title});
    }
    if(url.includes('/rest/v1/intmed_content_publish_tokens')){
      if(options.method==='DELETE'){tokens=tokens.filter(row=>!url.includes(row.draft_id));return new Response(null,{status:204});}
      if(options.method==='POST'){tokens.push(JSON.parse(options.body));return new Response(null,{status:201});}
      if(options.method==='PATCH'){for(const token of tokens)if(url.includes(token.draft_id))Object.assign(token,JSON.parse(options.body));return new Response(null,{status:204});}
      return Response.json(tokens.filter(row=>url.includes(row.draft_id)&&url.includes(row.token_hash)&&!row.consumed_at).map(row=>({draft_id:row.draft_id})));
    }
    if(url.includes('/rest/v1/intmed_content_drafts?')){
      const selected=rows.filter(row=>url.includes(row.id)&&(!url.includes('status=eq.publishing')||row.status==='publishing')&&(!url.includes('status=eq.publish_requested')||row.status==='publish_requested'));
      if(options.method==='PATCH'){selected.forEach(row=>Object.assign(row,JSON.parse(options.body)));return new Response(null,{status:204});}
      return Response.json(selected);
    }
    if(url.includes('/actions/workflows/publish-content.yml/dispatches')){dispatches.push(JSON.parse(options.body));return new Response(null,{status:204});}
    if(url.includes('/compare/'))return Response.json({status:diverged?'diverged':url.endsWith('/compare/'+publication+'...'+oldPin)?'behind':url.endsWith('/compare/'+oldPin+'...'+publication)?'ahead':'identical'});
    if(url.includes('/intMed-study-plan/contents/docs/content/manifest.json'))return Response.json({encoding:'base64',content:btoa(JSON.stringify({topics:{'cardio-ph':{sha256:'e'.repeat(64),path:'content/topics/cardio-ph.json'}}}))});
    if(url.includes('/gerami-website/contents/deploy/projects.json')){
      if(options.method==='PUT'){hostWrites.push(JSON.parse(options.body));if(hostWrite!==200)return Response.json({message:'Resource not accessible by token'},{status:hostWrite});host=JSON.parse(Buffer.from(hostWrites.at(-1).content,'base64').toString('utf8'));return Response.json({commit:{sha:'b'.repeat(40)}});}
      return Response.json({sha:'file-sha',encoding:'base64',content:btoa(JSON.stringify(host))});
    }
    throw Error('Unexpected '+url);
  };
  vm.runInContext(source,vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Request,Response,TextEncoder,TextDecoder,Uint8Array,btoa,atob,crypto:webcrypto,console}));
  const request=async(body,authorization)=>{const response=await handler(new Request('https://project.supabase.co/publisher',{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{authorization}: {})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
  return {request,rows,dispatches,hostWrites,getHost:()=>host};
}

let app=await harness();
assert.equal((await app.request({action:'dispatch',draftId:ids[0]},'Bearer service')).status,202);
assert.equal((await app.request({action:'dispatch',draftId:ids[1]},'Bearer service')).status,202);
assert.equal(app.dispatches.length,1,'all accepted drafts persist in FIFO server queue; only one publisher may run');
assert.equal(app.rows[1].status,'publish_requested','waiting drafts must not be falsely marked running');
let capability=app.dispatches[0].inputs.capability;
let result=await app.request({action:'deploy',draftId:ids[0],capability,commit:publication});
assert.equal(result.status,202,'publication must advance the actual host pin, not only push the study repository');
assert.equal(app.getHost().intmed.commit,publication);assert.equal(app.getHost().aus.commit,ausPin);assert.deepEqual(app.getHost().extra,{preserve:true});
assert.equal(app.hostWrites[0].branch,'main');assert.equal(app.hostWrites[0].sha,'file-sha');
assert.equal((await app.request({action:'result',draftId:ids[0],capability,ok:true,commit:publication})).status,200);
assert.equal(app.rows[0].status,'published');assert.equal(app.dispatches.length,2,'completion must wake the next server-side request without an open browser');
assert.equal(app.rows[1].status,'publishing');
assert.equal((await app.request({action:'drain'})).status,403,'periodic wake must require internal authorization');

app=await harness({hostWrite:403});await app.request({action:'dispatch',draftId:ids[0]},'Bearer service');capability=app.dispatches[0].inputs.capability;
result=await app.request({action:'deploy',draftId:ids[0],capability,commit:publication});
assert.equal(result.status,503);assert.equal(result.body.code,'hosting_permission_required');
assert.equal(app.rows[0].status,'publishing','permission failure cannot be reported as published');
assert.ok(!JSON.stringify(result.body).includes('private-pat'));

app=await harness({diverged:true});await app.request({action:'dispatch',draftId:ids[0]},'Bearer service');capability=app.dispatches[0].inputs.capability;
result=await app.request({action:'deploy',draftId:ids[0],capability,commit:publication});
assert.equal(result.status,409);assert.equal(app.hostWrites.length,0,'foreign or diverged commits must not move the host');
console.log('Publisher passed: durable queue, one active release, independent chaining, restricted host pin, permission errors and no foreign-commit deployment.');
