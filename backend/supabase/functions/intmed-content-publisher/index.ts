// Cloud publisher bridge. An admin review request dispatches GitHub Actions;
// the workflow receives a short-lived capability scoped to exactly one draft.
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const commitHex=/^[0-9a-f]{40}$/;
const SOURCE='intMed-study-plan',HOST='gerami-website',SOURCE_BRANCH='claude/quirky-ride-mavb6b';
class PublicationError extends Error {
  status:number;code:string;
  constructor(status:number,code:string,message=code){super(message);this.status=status;this.code=code;}
}
function fail(status:number,code:string,message?:string):never{throw new PublicationError(status,code,message);}
function sameJson(a:unknown,b:unknown):boolean{
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const left=Object.keys(a).sort(),right=Object.keys(b).sort();
  return left.length===right.length&&left.every((key,i)=>key===right[i]&&sameJson((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
const clean=(value:unknown,limit:number)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,limit);
const encode=(value:string)=>encodeURIComponent(value);

async function digest(value:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(row=>row.toString(16).padStart(2,'0')).join('');
}
function capability(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(row=>row.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async req=>{
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(Number(req.headers.get('content-length')||0)>20_000)return reply(413,{message:'Payload too large'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!service)return reply(503,{message:'Publisher configuration missing'});
  const server={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path:string,method='GET',value?:unknown,extra:Record<string,string>={}){
    const response=await fetch(base+'/rest/v1/'+path,{signal:AbortSignal.timeout(15000),method,headers:{...server,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const raw=await response.text();let parsed:unknown=null;try{parsed=raw?JSON.parse(raw):null;}catch{}
    if(!response.ok)throw new Error('database_'+response.status);
    return parsed;
  }
  async function startNext(){
    const githubToken=Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN');
    if(!githubToken)throw Error('github_token_missing');
    const picked=await db('rpc/claim_intmed_publication','POST',{}) as {id:string;title:string}|null;
    if(!picked)return null;
    if(!uuid.test(picked.id))throw Error('invalid_queue_claim');
    try{
      const token=capability(),tokenHash=await digest(token),expires=new Date(Date.now()+45*60*1000).toISOString();
      await db('intmed_content_publish_tokens?draft_id=eq.'+picked.id,'DELETE',undefined,{'Prefer':'return=minimal'});
      await db('intmed_content_publish_tokens','POST',{draft_id:picked.id,token_hash:tokenHash,expires_at:expires},{'Prefer':'return=minimal'});
      const dispatched=await github(SOURCE+'/actions/workflows/publish-content.yml/dispatches','POST',{ref:SOURCE_BRANCH,inputs:{draft_id:picked.id,capability:token}});
      if(!dispatched.ok)throw Error('github_dispatch_'+dispatched.status);
      return picked.id;
    }catch(error){
      await db('intmed_content_drafts?id=eq.'+picked.id+'&status=eq.publishing','PATCH',{status:'publish_error',publish_error:'شروع ناشر ناموفق بود؛ درخواست محفوظ است و می‌توانید دوباره انتشار را بزنید.',updated_at:new Date().toISOString()},{'Prefer':'return=minimal'});
      throw error;
    }
  }
  async function github(path:string,method='GET',body?:unknown){
    const token=Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN');if(!token)fail(503,'github_token_missing');
    try{
      const response=await fetch('https://api.github.com/repos/4mirgr/'+path,{signal:AbortSignal.timeout(15000),redirect:'error',method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      const limit=4*1024*1024;
      if(Number(response.headers.get('content-length')||0)>limit){await response.body?.cancel();fail(503,'github_response_invalid');}
      const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
      if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();fail(503,'github_response_invalid');}chunks.push(part.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let value;try{value=size?JSON.parse(new TextDecoder().decode(bytes)):{};}catch{fail(503,'github_response_invalid');}
      return {ok:response.ok,status:response.status,value};
    }catch(error){if(error instanceof PublicationError)throw error;fail(503,'github_unavailable','GitHub did not respond within the bounded request.');}
  }
  function checked(result:{ok:boolean;status:number;value:any},repo:string,write=false){
    if(result.ok)return result.value;
    if([401,403,404].includes(result.status))fail(503,repo===HOST?'hosting_permission_required':'source_permission_required',repo===HOST?'Publisher token requires Contents read/write on gerami-website.':'Publisher token requires read access to the configured source repository.');
    fail(503,write?'hosting_update_failed':'github_read_failed');
  }
  function fileJson(value:{content?:string;encoding?:string}){
    if(value.encoding!=='base64'||typeof value.content!=='string')throw Error('github_file_invalid');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.content.replace(/\s/g,'')),char=>char.charCodeAt(0))));
  }
  async function mainHead(){
    const value=checked(await github(HOST+'/git/ref/heads/main'),HOST);
    if(value.object?.type!=='commit'||!commitHex.test(String(value.object?.sha||'')))fail(409,'host_release_conflict');
    return String(value.object.sha);
  }
  async function pinsAt(ref:string){
    const value=checked(await github(HOST+'/contents/deploy/projects.json?ref='+encode(ref)),HOST);
    const pins=fileJson(value),pin=pins?.intmed;
    if(pin?.repository!=='https://github.com/4mirgr/intMed-study-plan.git'||pin.public_directory!=='docs'||pin.mount!=='intmed'||!commitHex.test(String(pin.commit||'')))fail(409,'host_contract_changed');
    return pins;
  }
  const rootRef=(base:string,commit:string)=>'intmed-release-check-'+base+'-'+commit;
  async function sourceRelease(commit:string,topicId:string){
    const membership=await github(SOURCE+'/compare/'+commit+'...'+encode(SOURCE_BRANCH));
    if(!membership.ok||!['ahead','identical'].includes(membership.value.status))fail(409,'foreign_release','Release does not belong to the publication branch.');
    const manifest=await github(SOURCE+'/contents/docs/content/manifest.json?ref='+commit);
    if(!manifest.ok||!hex.test(String(fileJson(manifest.value)?.topics?.[topicId]?.sha256||'')))fail(409,'release_topic_missing');
    const tag=await github(SOURCE+'/git/ref/tags/intmed-release-check-'+commit);
    if(!tag.ok||tag.value.object?.type!=='commit'||tag.value.object?.sha!==commit)fail(409,'source_validation_ref_invalid','Immutable source validation tag is missing or has the wrong target.');
  }
  async function validation(repo:string,workflow:string,commit:string,afterRunId=0,ref?:string){
    const metadata=await github(repo+'/actions/workflows/'+workflow);
    const permission=repo===HOST?'hosting_actions_permission_required':'source_actions_permission_required';
    if(!metadata.ok){if([401,403,404].includes(metadata.status))fail(503,permission,'Publisher token requires Actions read/write on '+repo+'.');fail(503,'ci_status_unavailable');}
    if(!Number.isSafeInteger(metadata.value.id)||metadata.value.state!=='active')fail(503,'ci_workflow_unavailable');
    const response=await github(repo+'/actions/workflows/'+workflow+'/runs?head_sha='+commit+'&per_page=100');
    if(!response.ok){if([401,403,404].includes(response.status))fail(503,permission,'Publisher token requires Actions read/write on '+repo+'.');fail(503,'ci_status_unavailable');}
    if(!Array.isArray(response.value.workflow_runs)||!Number.isSafeInteger(response.value.total_count)||response.value.total_count>100)fail(503,'ci_history_incomplete');
    // Newer visible eligible runs override older success, including rerun attempts.
    const runs=response.value.workflow_runs.filter((run:any)=>Number.isSafeInteger(run.id)&&run.id>afterRunId&&run.workflow_id===metadata.value.id&&run.head_sha===commit&&run.head_repository?.full_name?.toLowerCase()==='4mirgr/'+repo.toLowerCase()&&((run.event==='push'&&run.head_branch===(repo===HOST?'main':SOURCE_BRANCH))||(run.event==='workflow_dispatch'&&run.head_branch===(ref||'intmed-release-check-'+commit)))).sort((a:any,b:any)=>b.id-a.id||(b.run_attempt||1)-(a.run_attempt||1));
    const current=runs[0];
    const run=current?{id:current.id,attempt:current.run_attempt||1,status:current.status,conclusion:current.conclusion??null,url:'https://github.com/4mirgr/'+repo+'/actions/runs/'+current.id}:null;
    return {ok:true,state:!current||current.status!=='completed'?'waiting':current.conclusion==='success'?'passed':'failed',afterRunId,run};
  }
  async function ensureValidation(repo:string,workflow:string,commit:string,ref:string){
    const status=await validation(repo,workflow,commit,0,ref);
    if(status.state!=='failed'&&status.run)return status;
    const afterRunId=status.run?.id||0;
    const dispatched=await github(repo+'/actions/workflows/'+workflow+'/dispatches','POST',{ref});
    if(!dispatched.ok){if([401,403,404].includes(dispatched.status))fail(503,repo===HOST?'hosting_actions_permission_required':'source_actions_permission_required','Publisher token requires Actions read/write on '+repo+'.');fail(503,'ci_dispatch_failed');}
    return {ok:true,state:'waiting',afterRunId,run:null};
  }
  async function requireSource(commit:string){
    const status=await validation(SOURCE,'validate-and-deploy.yml',commit);
    if(status.state!=='passed')fail(409,'source_validation_'+status.state,'Exact release source validation has not passed.');
  }
  async function verifyCandidate(commit:string,rootBase:string,hostingCommit:string){
    const ref=rootRef(rootBase,commit),branch=await github(HOST+'/git/ref/heads/'+ref);
    if(!branch.ok||branch.value.object?.type!=='commit'||branch.value.object?.sha!==hostingCommit)fail(409,'host_candidate_invalid');
    const original=await pinsAt(rootBase);
    if(hostingCommit===rootBase){if(original.intmed.commit!==commit)fail(409,'host_candidate_invalid');return {ref,mode:'already_current'};}
    const forward=await github(SOURCE+'/compare/'+original.intmed.commit+'...'+commit);
    if(original.intmed.commit===commit||!forward.ok||forward.value.status!=='ahead')fail(409,'host_release_conflict','Host update would diverge or roll back.');
    const expected=structuredClone(original);expected.intmed.commit=commit;
    const object=checked(await github(HOST+'/git/commits/'+hostingCommit),HOST);
    if(object.sha!==hostingCommit||object.parents?.length!==1||object.parents[0]?.sha!==rootBase)fail(409,'host_candidate_invalid');
    const changes=checked(await github(HOST+'/compare/'+rootBase+'...'+hostingCommit),HOST);
    if(changes.status!=='ahead'||changes.total_commits!==1||changes.files?.length!==1||changes.files[0]?.filename!=='deploy/projects.json'||changes.files[0]?.status!=='modified')fail(409,'host_candidate_invalid');
    if(!sameJson(expected,await pinsAt(hostingCommit)))fail(409,'host_candidate_invalid');
    return {ref,mode:'candidate'};
  }
  // Audit refs are create-only; main advances later to the exact checked commit.
  async function prepareCandidate(commit:string){
    const rootBase=await mainHead(),pins=await pinsAt(rootBase),ref=rootRef(rootBase,commit);
    const existing=await github(HOST+'/git/ref/heads/'+ref);let hostingCommit:string;
    if(existing.ok)hostingCommit=String(existing.value.object?.sha||'');
    else{
      if(existing.status!==404)checked(existing,HOST);
      hostingCommit=rootBase;
      if(pins.intmed.commit!==commit){
        const forward=await github(SOURCE+'/compare/'+pins.intmed.commit+'...'+commit);
        if(!forward.ok||forward.value.status!=='ahead')fail(409,'host_release_conflict','Host update would diverge or roll back.');
        const parent=checked(await github(HOST+'/git/commits/'+rootBase),HOST);
        if(!commitHex.test(String(parent.tree?.sha||'')))fail(409,'host_candidate_invalid');
        const updated=structuredClone(pins);updated.intmed.commit=commit;
        const tree=checked(await github(HOST+'/git/trees','POST',{base_tree:parent.tree.sha,tree:[{path:'deploy/projects.json',mode:'100644',type:'blob',content:JSON.stringify(updated,null,2)+'\n'}]}),HOST,true);
        if(!commitHex.test(String(tree.sha||'')))fail(503,'hosting_update_failed');
        const created=checked(await github(HOST+'/git/commits','POST',{message:'Deploy approved IntMed release '+commit.slice(0,12),tree:tree.sha,parents:[rootBase]}),HOST,true);
        hostingCommit=String(created.sha||'');
      }
      if(!commitHex.test(hostingCommit))fail(503,'hosting_update_failed');
      const created=await github(HOST+'/git/refs','POST',{ref:'refs/heads/'+ref,sha:hostingCommit});
      if(!created.ok){
        if(![409,422].includes(created.status))checked(created,HOST,true);
        const concurrent=checked(await github(HOST+'/git/ref/heads/'+ref),HOST);hostingCommit=String(concurrent.object?.sha||'');
      }
    }
    if(!commitHex.test(hostingCommit))fail(409,'host_candidate_invalid');
    const candidate=await verifyCandidate(commit,rootBase,hostingCommit);
    if(await mainHead()!==rootBase)fail(409,'host_release_conflict','Host main moved; prepare and validate a fresh candidate.');
    return {rootBase,hostingCommit,...candidate};
  }
  async function requireHosting(commit:string,rootBase:string,hostingCommit:string){
    const candidate=await verifyCandidate(commit,rootBase,hostingCommit);
    const status=await validation(HOST,'site-checks.yml',hostingCommit,0,candidate.ref);
    if(status.state!=='passed')fail(409,'hosting_validation_'+status.state,'Exact host browser and combined-build validation has not passed.');
    return candidate;
  }
  let input:Record<string,unknown>;try{input=await req.json();}catch{return reply(400,{message:'Invalid JSON'});}
  const action=clean(input.action,30),draftId=clean(input.draftId,40);
  if(action==='drain'){
    if(req.headers.get('authorization')!=='Bearer '+service)return reply(403,{message:'Internal queue wake only'});
    try{return reply(200,{ok:true,started:!!(await startNext())});}catch{return reply(503,{message:'Publisher queue wake failed'});}
  }
  if(!uuid.test(draftId))return reply(400,{message:'Invalid draft'});
  try{
    if(action==='dispatch'){
      if(req.headers.get('authorization')!=='Bearer '+service)return reply(403,{message:'Internal dispatch only'});
      const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&select=id,status&limit=1') as Array<Record<string,unknown>>;
      if(!rows[0]||!['publish_requested','publishing','published'].includes(String(rows[0].status)))return reply(409,{message:'Draft is not queued for cloud publication'});
      if(rows[0].status==='published')return reply(200,{ok:true,status:'published'});
      try{await startNext();}catch{
        const current=await db('intmed_content_drafts?id=eq.'+draftId+'&select=status&limit=1') as Array<Record<string,unknown>>;
        if(current[0]?.status==='publish_error')return reply(502,{message:'شروع ناشر ناموفق بود؛ درخواست محفوظ است.',code:'github_dispatch_failed'});
      }
      const current=await db('intmed_content_drafts?id=eq.'+draftId+'&select=status&limit=1') as Array<Record<string,unknown>>;
      return reply(202,{ok:true,status:current[0]?.status||'publish_requested',message:'درخواست در صف سرور ثبت شد؛ می‌توانید پنجره را ببندید و مورد بعدی را بازبینی کنید.'});
    }
    const token=clean(input.capability,80),tokenHash=await digest(token);
    if(!hex.test(token)||!hex.test(tokenHash))return reply(403,{message:'Invalid capability'});
    async function activeGrant(){
      const grants=await db('intmed_content_publish_tokens?draft_id=eq.'+draftId+'&token_hash=eq.'+tokenHash+'&consumed_at=is.null&expires_at=gt.'+encode(new Date().toISOString())+'&select=draft_id&limit=1') as Array<Record<string,unknown>>;
      if(!grants[0])fail(403,'publication_capability_invalid','Capability expired or invalid.');
    }
    async function activePublication(recheckGrant=true){
      if(recheckGrant)await activeGrant();
      const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publishing&publishing_runner=eq.github-actions&select=topic_id&limit=1') as Array<Record<string,unknown>>;
      const topicId=String(rows[0]?.topic_id||'');if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(topicId))fail(409,'publication_not_active','Publication is not active.');
      return topicId;
    }
    await activeGrant();
    const releaseActions=['validate','validation_status','prepare_deploy','deployment_status','deploy'];
    if(releaseActions.includes(action)||(action==='result'&&input.ok===true)){
      const commit=clean(input.commit,80);if(!commitHex.test(commit))return reply(400,{message:'Invalid release commit'});
      const topicId=await activePublication(false);
      await sourceRelease(commit,topicId);
      const afterRunId=input.afterRunId===undefined?0:Number(input.afterRunId);
      if(!Number.isSafeInteger(afterRunId)||afterRunId<0)return reply(400,{message:'Invalid validation floor'});
      if(action==='validate')return reply(200,await ensureValidation(SOURCE,'validate-and-deploy.yml',commit,'intmed-release-check-'+commit));
      if(action==='validation_status')return reply(200,await validation(SOURCE,'validate-and-deploy.yml',commit,afterRunId));
      await requireSource(commit);
      if(action==='prepare_deploy'){
        const candidate=await prepareCandidate(commit);
        return reply(200,{...candidate,...await ensureValidation(HOST,'site-checks.yml',candidate.hostingCommit,candidate.ref)});
      }
      const rootBase=clean(input.rootBase,80),hostingCommit=clean(input.hostingCommit,80);
      if(!commitHex.test(rootBase)||!commitHex.test(hostingCommit))return reply(400,{message:'Exact root base and hosting commit are required'});
      if(action==='deployment_status'){
        const candidate=await verifyCandidate(commit,rootBase,hostingCommit);
        const main=await mainHead();if(main!==rootBase&&main!==hostingCommit)fail(409,'host_release_conflict');
        return reply(200,{rootBase,hostingCommit,...candidate,...await validation(HOST,'site-checks.yml',hostingCommit,afterRunId,candidate.ref)});
      }
      await requireHosting(commit,rootBase,hostingCommit);
      const main=await mainHead();
      if(action==='deploy'){
        if(main!==rootBase&&main!==hostingCommit)fail(409,'host_release_conflict','Host main moved; prepare and validate a fresh candidate.');
        // Remote CI reads must not outlive the capability or the queue claim.
        if(await activePublication()!==topicId)fail(409,'publication_changed');
        if(main!==hostingCommit){
          // A concurrent forward main update makes this non-force update fail.
          const advanced=await github(HOST+'/git/refs/heads/main','PATCH',{sha:hostingCommit,force:false});
          if(!advanced.ok){if([409,422].includes(advanced.status))fail(409,'host_release_conflict');checked(advanced,HOST,true);}
          if(await mainHead()!==hostingCommit)fail(409,'host_release_conflict');
        }
        return reply(202,{ok:true,rootBase,hostingCommit,alreadyRequested:main===hostingCommit});
      }
      if(main!==hostingCommit)fail(409,'hosting_release_not_current','Exact tested host release is not current on main.');
      if((await pinsAt(main)).intmed.commit!==commit)fail(409,'hosting_release_not_current');
      if(await activePublication()!==topicId)fail(409,'publication_changed');
    }
    if(action==='claim'){
      const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publishing&publishing_runner=eq.github-actions&select=id,ingest_id,topic_id,title,source_summary,draft_json,target_category_id,target_topic_label,target_topic_is_new,target_content_kind,target_source_class,target_rights_note,intmed_content_ingest(kind,mime_type,original_filename,storage_path,content_text,caption,sha256,source_type,source_name)&limit=1') as Array<Record<string,unknown>>;
      const draft=rows[0];if(!draft)return reply(409,{message:'Draft is not assigned to GitHub Actions'});
      const item=(draft.intmed_content_ingest||{}) as Record<string,unknown>;let downloadUrl:string|null=null;
      if(item.kind!=='text'){
        const path=String(item.storage_path||'');if(!path)return reply(409,{message:'Source unavailable'});
        const signed=await fetch(base+'/storage/v1/object/sign/intmed-content-inbox/'+path.split('/').map(encode).join('/'),{signal:AbortSignal.timeout(15000),method:'POST',headers:server,body:JSON.stringify({expiresIn:2700})});
        if(!signed.ok)return reply(503,{message:'Could not sign source'});
        const value=await signed.json(),relative=String(value.signedURL||value.signedUrl||'');downloadUrl=relative.startsWith('http')?relative:base+'/storage/v1'+(relative.startsWith('/')?'':'/')+relative;
      }
      return reply(200,{ok:true,job:{draftId:draft.id,ingestId:draft.ingest_id,title:draft.title,sourceSummary:draft.source_summary,draft:draft.draft_json,target:{categoryId:draft.target_category_id,topicId:draft.topic_id,topicLabel:draft.target_topic_label,isNew:!!draft.target_topic_is_new,kind:draft.target_content_kind,sourceClass:draft.target_source_class,rightsNote:draft.target_rights_note},source:{kind:item.kind,mimeType:item.mime_type,filename:clean(item.original_filename,180),sha256:item.sha256||null,contentText:item.kind==='text'?String(item.content_text||''):null,downloadUrl,sourceType:item.source_type||null,sourceName:clean(item.source_name,300)}}});
    }
    if(action==='result'){
      const ok=input.ok===true,now=new Date().toISOString();
      const patch=ok?{status:'published',published_at:now,published_commit:clean(input.commit,80),publish_error:null,updated_at:now}:{status:'publish_error',publish_error:clean(input.error||'GitHub publisher failed',1000),updated_at:now};
      if(ok&&!patch.published_commit)return reply(400,{message:'Commit is required'});
      // Confirm the conditional update before consuming this request's capability.
      const saved=await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publishing&publishing_runner=eq.github-actions&select=id,status','PATCH',patch,{'Prefer':'return=representation'}) as Array<Record<string,unknown>>;
      if(saved?.length!==1||saved[0]?.id!==draftId||saved[0]?.status!==patch.status)fail(409,'publication_not_active','Publication changed before its result was saved.');
      await db('intmed_content_publish_tokens?draft_id=eq.'+draftId+'&token_hash=eq.'+tokenHash+'&consumed_at=is.null','PATCH',{consumed_at:now},{'Prefer':'return=minimal'});
      try{await startNext();}catch{console.warn('publisher_next_wake_failed');}
      return reply(200,{ok:true,status:patch.status});
    }
    return reply(400,{message:'Unknown action'});
  }catch(error){if(error instanceof PublicationError)return reply(error.status,{message:error.message,code:error.code});return reply(503,{message:'Cloud publisher unavailable',code:'publisher_unavailable'});}
});
