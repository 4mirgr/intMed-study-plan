import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';

const source=stripTypeScriptTypes(fs.readFileSync('backend/supabase/functions/intmed-content-publisher/index.ts','utf8'));
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const publication='c'.repeat(40),oldPin='a'.repeat(40),ausPin='d'.repeat(40),rootBase='b'.repeat(40),candidate='f'.repeat(40),tree='1'.repeat(40);
const sourceRepo='4mirgr/intMed-study-plan',rootRepo='4mirgr/gerami-website';
const run=(id,repo,sha,conclusion='success',extra={})=>({id,workflow_id:repo===sourceRepo?11:22,head_sha:sha,head_repository:{full_name:repo},event:'workflow_dispatch',head_branch:repo===sourceRepo?'intmed-release-check-'+sha:'intmed-release-check-'+rootBase+'-'+publication,status:conclusion===null?'in_progress':'completed',conclusion,run_attempt:1,html_url:'https://github.com/'+repo+'/actions/runs/'+id,...extra});
async function harness(config={}){
  let handler,dispatches=[],ciDispatches=[],hostWrites=[],tokens=[],calls=[],rows=ids.map(id=>({id,title:'Reviewed content',topic_id:'cardio-ph',status:'publish_requested',publishing_runner:null}));
  let host={intmed:{repository:'https://github.com/4mirgr/intMed-study-plan.git',commit:config.noop?publication:oldPin,public_directory:'docs',mount:'intmed'},aus:{repository:'https://github.com/4mirgr/immi-arash-amir.git',commit:ausPin,public_directory:'dist',mount:'aus'},extra:{preserve:true}};
  const baseHost=structuredClone(host);
  let nextHost=null,main=rootBase,branch=null;
  const state={sourceRuns:config.sourceRuns??[run(101,sourceRepo,publication)],rootRuns:config.rootRuns??[run(201,rootRepo,config.noop?rootBase:candidate)]};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',INTMED_GITHUB_ACTIONS_TOKEN:'private-pat'};
  const json=(value,status=200)=>Response.json(value,{status});
  const file=value=>json({sha:'file-sha',encoding:'base64',content:btoa(JSON.stringify(value))});
  const fetchMock=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',signal:options.signal});
    if(state.hook)state.hook(url,options,rows,tokens);
    if(config.githubThrows&&url.includes('/compare/'))throw Error('private-pat provider secret');
    if(config.oversizedResponse&&url.includes('/compare/'))return new Response('private-pat provider secret',{headers:{'Content-Length':String(5*1024*1024)}});
    const body=options.body?JSON.parse(options.body):null;
    if(url.includes('/rest/v1/rpc/claim_intmed_publication')){
      if(rows.some(row=>row.status==='publishing'))return json(null);
      const row=rows.find(row=>row.status==='publish_requested');if(!row)return json(null);
      Object.assign(row,{status:'publishing',publishing_runner:'github-actions'});return json({id:row.id,title:row.title});
    }
    if(url.includes('/rest/v1/intmed_content_publish_tokens')){
      if(options.method==='DELETE'){tokens=tokens.filter(row=>!url.includes(row.draft_id));return new Response(null,{status:204});}
      if(options.method==='POST'){tokens.push(body);return new Response(null,{status:201});}
      if(options.method==='PATCH'){for(const token of tokens)if(url.includes(token.draft_id)&&(!url.includes('token_hash=eq.')||url.includes(token.token_hash)))Object.assign(token,body);return new Response(null,{status:204});}
      return json(tokens.filter(row=>url.includes(row.draft_id)&&url.includes(row.token_hash)&&!row.consumed_at&&Date.parse(row.expires_at)>Date.now()).map(row=>({draft_id:row.draft_id})));
    }
    if(url.includes('/rest/v1/intmed_content_drafts?')){
      if(state.reclaimResultPatch&&options.method==='PATCH'&&body?.status==='published')rows[0].status='publish_error';
      const selected=rows.filter(row=>url.includes(row.id)&&(!url.includes('status=eq.publishing')||row.status==='publishing')&&(!url.includes('status=eq.publish_requested')||row.status==='publish_requested'));
      if(options.method==='PATCH'){selected.forEach(row=>Object.assign(row,body));return options.headers?.Prefer==='return=representation'?json(selected):new Response(null,{status:204});}
      return json(selected);
    }
    if(url.includes('/actions/workflows/publish-content.yml/dispatches')){dispatches.push(body);return new Response(null,{status:204});}
    if(url.includes('/actions/workflows/')){
      const root=url.includes('/gerami-website/'),permission=root?config.rootPermission:config.sourcePermission;
      if(permission)return json({message:'token private-pat secret provider response'},permission);
      if(url.endsWith('/dispatches')){ciDispatches.push({root,...body});return new Response(null,{status:204});}
      if(url.includes('/runs?'))return json({total_count:config.historyCount??(root?state.rootRuns:state.sourceRuns).length,workflow_runs:root?state.rootRuns:state.sourceRuns});
      return json({id:root?22:11,state:'active'});
    }
    if(url.includes('/intMed-study-plan/git/ref/tags/'))return config.missingTag?json({},404):json({object:{type:'commit',sha:config.wrongTag?oldPin:publication}});
    if(url.includes('/intMed-study-plan/compare/'))return json({status:config.diverged?'diverged':url.endsWith('/compare/'+publication+'...'+oldPin)?'behind':url.endsWith('/compare/'+oldPin+'...'+publication)?'ahead':'identical'});
    if(url.includes('/intMed-study-plan/contents/docs/content/manifest.json'))return file({topics:{'cardio-ph':{sha256:'e'.repeat(64),path:'content/topics/cardio-ph.json'}}});
    if(url.includes('/gerami-website/git/ref/heads/main'))return json({object:{type:'commit',sha:main}});
    if(url.includes('/gerami-website/git/ref/heads/intmed-release-check-'))return branch?json({object:{type:'commit',sha:config.movedRef?oldPin:branch}}):json({},404);
    if(url.endsWith('/gerami-website/git/refs')&&options.method==='POST'){branch=body.sha;return json({object:{sha:branch}},201);}
    if(url.includes('/gerami-website/git/commits/')){const sha=url.split('/').at(-1);return json({sha,tree:{sha:tree},parents:[{sha:sha===candidate?(config.wrongParent?oldPin:rootBase):oldPin}]});}
    if(url.endsWith('/gerami-website/git/trees')&&options.method==='POST'){nextHost=JSON.parse(body.tree[0].content);return json({sha:tree},201);}
    if(url.endsWith('/gerami-website/git/commits')&&options.method==='POST')return json({sha:candidate},201);
    if(url.includes('/gerami-website/compare/'))return json({total_commits:config.extraCommit?2:1,status:'ahead',files:config.extraFile?[{filename:'deploy/projects.json',status:'modified'},{filename:'index.html',status:'modified'}]:[{filename:'deploy/projects.json',status:'modified'}]});
    if(url.includes('/gerami-website/contents/deploy/projects.json')){
      if(options.method==='PUT'){hostWrites.push(body);return json({commit:{sha:candidate}});}
      let value=url.includes('ref='+candidate)?nextHost:baseHost;
      if(config.otherPin&&url.includes('ref='+candidate))value={...value,aus:{...value.aus,commit:publication}};
      if(config.otherField&&url.includes('ref='+candidate))value={...value,extra:{preserve:false}};
      return file(value);
    }
    if(url.endsWith('/gerami-website/git/refs/heads/main')&&options.method==='PATCH'){
      hostWrites.push(body);
      if(config.hostWrite)return json({message:'private-pat provider secret'},config.hostWrite);
      if(config.concurrentMain){main=oldPin;return json({message:'Not fast forward'},422);}
      main=body.sha;host=nextHost||host;
      if(config.postPushPending)state.rootRuns.push(run(202,rootRepo,candidate,null,{event:'push',head_branch:'main'}));
      return json({object:{sha:main}});
    }
    throw Error('Unexpected '+url);
  };
  vm.runInContext(source,vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Request,Response,TextEncoder,TextDecoder,Uint8Array,btoa,atob,crypto:webcrypto,console,AbortSignal,structuredClone}));
  const request=async(body,authorization)=>{const response=await handler(new Request('https://project.supabase.co/publisher',{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{authorization}: {})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
  await request({action:'dispatch',draftId:ids[0]},'Bearer service');
  const token=dispatches[0].inputs.capability;
  const call=(action,extra={})=>request({action,draftId:ids[0],capability:token,commit:publication,rootBase,hostingCommit:config.noop?rootBase:candidate,...extra});
  return {request,call,rows,dispatches,ciDispatches,hostWrites,tokens,calls,state,getHost:()=>host,getMain:()=>main,setMain:value=>main=value};
}

// These four regressions reproduce the old publisher's bypass before the fix.
const bypasses=[];
for(const [label,config] of [['missing source CI',{sourceRuns:[]}],['failed source CI',{sourceRuns:[run(101,sourceRepo,publication,'failure')]}],['missing root CI',{rootRuns:[]}],['failed root CI',{rootRuns:[run(201,rootRepo,candidate,'failure')]}]]){
  const app=await harness(config);if(label.includes('root'))await app.call('prepare_deploy');const result=await app.call('deploy');
  if(result.status!==409||app.hostWrites.length)bypasses.push({label,status:result.status,writes:app.hostWrites.length});
}
assert.deepEqual(bypasses,[],'unvalidated source/root releases must not write main');

let app=await harness();
assert.equal((await app.request({action:'dispatch',draftId:ids[1]},'Bearer service')).status,202);
assert.equal(app.dispatches.length,1);assert.equal(app.rows[1].status,'publish_requested');
assert.equal((await app.call('validate')).body.state,'passed');
let prepared=await app.call('prepare_deploy');assert.equal(prepared.status,200);assert.equal(prepared.body.state,'passed');assert.equal(prepared.body.mode,'candidate');
assert.equal(prepared.body.rootBase,rootBase);assert.equal(prepared.body.hostingCommit,candidate);
let result=await app.call('deploy');assert.equal(result.status,202);assert.equal(app.getMain(),candidate);
assert.deepEqual(app.hostWrites,[{sha:candidate,force:false}]);assert.equal(app.getHost().intmed.commit,publication);assert.equal(app.getHost().aus.commit,ausPin);assert.deepEqual(app.getHost().extra,{preserve:true});
assert.equal((await app.call('deploy')).status,202,'exact tested release is idempotent');
assert.equal((await app.call('result',{ok:true})).status,200);assert.equal(app.rows[0].status,'published');assert.equal(app.dispatches.length,2);assert.equal(app.rows[1].status,'publishing');
assert.equal((await app.request({action:'drain'})).status,403);
assert.ok(app.calls.filter(c=>c.url.includes('api.github.com')).every(c=>c.signal),'GitHub requests have bounded timeouts');

for(const config of [{wrongParent:true},{extraFile:true},{extraCommit:true},{otherPin:true},{otherField:true},{movedRef:true}]){
  app=await harness(config);prepared=await app.call('prepare_deploy');assert.equal(prepared.status,409,JSON.stringify(config));assert.equal(app.hostWrites.length,0);
}
for(const config of [{diverged:true},{missingTag:true},{wrongTag:true}]){
  app=await harness(config);result=await app.call('validate');assert.equal(result.status,409);assert.equal(app.hostWrites.length,0);
}
for(const field of ['sourcePermission','rootPermission']){
  app=await harness({[field]:403});result=await app.call(field==='sourcePermission'?'validate':'prepare_deploy');assert.equal(result.status,503);assert.match(result.body.code,/permission_required/);assert.ok(!JSON.stringify(result).includes('private-pat'));assert.equal(app.hostWrites.length,0);
}
app=await harness({hostWrite:403});await app.call('prepare_deploy');result=await app.call('deploy');assert.equal(result.status,503);assert.equal(result.body.code,'hosting_permission_required');assert.equal(app.rows[0].status,'publishing');
app=await harness({concurrentMain:true});await app.call('prepare_deploy');result=await app.call('deploy');assert.equal(result.status,409);assert.equal(app.rows[0].status,'publishing');
app=await harness();await app.call('prepare_deploy');app.setMain(oldPin);result=await app.call('deploy');assert.equal(result.status,409);assert.equal(app.hostWrites.length,0);

for(const extra of [{head_sha:oldPin},{head_repository:{full_name:'attacker/fork'}},{workflow_id:999},{event:'pull_request'},{head_branch:'unrelated-validation-ref'}]){
  app=await harness({sourceRuns:[run(101,sourceRepo,publication,'success',extra)]});result=await app.call('validation_status');assert.equal(result.body.state,'waiting');assert.equal(app.ciDispatches.length,0);assert.equal((await app.call('deploy')).status,409);
}
for(const conclusion of ['failure','cancelled','timed_out','skipped','neutral',null]){
  app=await harness({sourceRuns:[run(100,sourceRepo,publication),run(101,sourceRepo,publication,conclusion)]});result=await app.call('validation_status');assert.equal(result.body.state,conclusion===null?'waiting':'failed');assert.equal((await app.call('deploy')).status,409);
}
app=await harness({sourceRuns:[run(101,sourceRepo,publication,'failure',{run_attempt:2}),run(101,sourceRepo,publication,'success',{run_attempt:1})]});assert.equal((await app.call('validation_status')).body.state,'failed');
app=await harness({sourceRuns:[run(101,sourceRepo,publication,'failure')]});result=await app.call('validate');assert.equal(result.body.state,'waiting');assert.equal(result.body.afterRunId,101);assert.equal(app.ciDispatches.length,1);
result=await app.call('validation_status',{afterRunId:101});assert.equal(result.body.state,'waiting');assert.equal(result.body.run,null);assert.equal(app.ciDispatches.length,1);
app.state.sourceRuns.push(run(102,sourceRepo,publication));assert.equal((await app.call('validation_status',{afterRunId:101})).body.state,'passed');
app=await harness({rootRuns:[run(201,rootRepo,candidate,'failure')]});result=await app.call('prepare_deploy');assert.equal(result.body.state,'waiting');assert.equal(result.body.afterRunId,201);assert.equal(app.ciDispatches.length,1);assert.equal((await app.call('deployment_status',{afterRunId:201})).body.state,'waiting');

app=await harness({noop:true});prepared=await app.call('prepare_deploy');assert.equal(prepared.body.mode,'already_current');assert.equal(prepared.body.hostingCommit,rootBase);assert.equal((await app.call('deploy')).status,202);assert.equal(app.hostWrites.length,0);assert.equal((await app.call('result',{ok:true})).status,200);
app=await harness({noop:true,rootRuns:[]});await app.call('prepare_deploy');assert.equal((await app.call('deploy')).status,409);assert.equal((await app.call('result',{ok:true})).status,409);assert.equal(app.rows[0].status,'publishing');assert.ok(!app.tokens[0].consumed_at);
app=await harness();assert.equal((await app.call('result',{ok:true})).status,409);assert.equal(app.rows[0].status,'publishing');assert.ok(!app.tokens[0].consumed_at);
app=await harness({postPushPending:true});await app.call('prepare_deploy');assert.equal((await app.call('deploy')).status,202);assert.equal((await app.call('result',{ok:true})).status,409);assert.equal(app.rows[0].status,'publishing');app.state.rootRuns.at(-1).status='completed';app.state.rootRuns.at(-1).conclusion='success';assert.equal((await app.call('result',{ok:true})).status,200);
app=await harness();app.tokens[0].expires_at=new Date(0).toISOString();assert.equal((await app.call('validate')).status,403);assert.equal(app.ciDispatches.length,0);
app=await harness();app.rows[0].status='publish_error';assert.equal((await app.call('validate')).status,409);assert.equal((await app.call('result',{ok:true})).status,409);
app=await harness();assert.equal((await app.call('result',{ok:false,error:'bounded CI timeout'})).status,200);assert.equal(app.rows[0].status,'publish_error');assert.equal(app.hostWrites.length,0);
for(const mutate of ['expire','abandon','changeTopic']){
  for(const action of ['deploy','result']){
    app=await harness();await app.call('prepare_deploy');if(action==='result')assert.equal((await app.call('deploy')).status,202);
    app.state.hook=(url,options,rows,tokens)=>{if(url.includes('/gerami-website/actions/workflows/site-checks.yml/runs?')){if(mutate==='expire')tokens[0].expires_at=new Date(0).toISOString();else if(mutate==='abandon')rows[0].status='publish_error';else rows[0].topic_id='cardio-other';app.state.hook=null;}};
    result=await app.call(action,action==='result'?{ok:true}:{});assert.equal(result.status,mutate==='expire'?403:409,mutate+' before '+action);assert.ok(!app.tokens[0].consumed_at);if(action==='deploy')assert.equal(app.hostWrites.length,0);
  }
}
app=await harness();await app.call('prepare_deploy');await app.call('deploy');app.state.reclaimResultPatch=true;result=await app.call('result',{ok:true});assert.equal(result.status,409);assert.equal(app.rows[0].status,'publish_error');assert.ok(!app.tokens[0].consumed_at,'zero-row result PATCH must not consume capability or report published');
app=await harness();await app.call('prepare_deploy');await app.call('deploy');const replacement={...app.tokens[0],token_hash:'9'.repeat(64)};app.tokens.push(replacement);assert.equal((await app.call('result',{ok:true})).status,200);assert.ok(!replacement.consumed_at,'completion consumes only the capability used by this request');
for(const config of [{githubThrows:true},{oversizedResponse:true},{historyCount:101}]){app=await harness(config);result=await app.call('validate');assert.equal(result.status,503);assert.ok(!JSON.stringify(result).includes('private-pat'));assert.equal(app.hostWrites.length,0);}
app=await harness({sourceRuns:[run(101,sourceRepo,publication,'success',{event:'push',head_branch:'claude/quirky-ride-mavb6b'})]});assert.equal((await app.call('validate')).body.state,'passed');
console.log('Publisher passed: exact source/root CI, immutable candidates, main concurrency, visibility/retry ordering, noop, capabilities, queue chaining, and fail-closed publication.');
