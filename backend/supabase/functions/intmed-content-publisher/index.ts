// Cloud publisher bridge. An admin review request dispatches GitHub Actions;
// the workflow receives a short-lived capability scoped to exactly one draft.
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
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
    const response=await fetch(base+'/rest/v1/'+path,{method,headers:{...server,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const raw=await response.text();let parsed:unknown=null;try{parsed=raw?JSON.parse(raw):null;}catch{}
    if(!response.ok)throw new Error('database_'+response.status+':'+clean((parsed as Record<string,unknown>)?.message,160));
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
      const dispatched=await fetch('https://api.github.com/repos/4mirgr/intMed-study-plan/actions/workflows/publish-content.yml/dispatches',{
        method:'POST',headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
        body:JSON.stringify({ref:'claude/quirky-ride-mavb6b',inputs:{draft_id:picked.id,capability:token}})
      });
      if(!dispatched.ok)throw Error('github_dispatch_'+dispatched.status);
      return picked.id;
    }catch(error){
      await db('intmed_content_drafts?id=eq.'+picked.id+'&status=eq.publishing','PATCH',{status:'publish_error',publish_error:'شروع ناشر ناموفق بود؛ درخواست محفوظ است و می‌توانید دوباره انتشار را بزنید.',updated_at:new Date().toISOString()},{'Prefer':'return=minimal'});
      throw error;
    }
  }
  async function github(path:string,method='GET',body?:unknown){
    const token=Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN');if(!token)throw Error('github_token_missing');
    const response=await fetch('https://api.github.com/repos/4mirgr/'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    let value;try{value=await response.json();}catch{value={};}
    return {ok:response.ok,status:response.status,value};
  }
  function fileJson(value:{content?:string;encoding?:string}){
    if(value.encoding!=='base64'||typeof value.content!=='string')throw Error('github_file_invalid');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.content.replace(/\s/g,'')),char=>char.charCodeAt(0))));
  }
  function encodedJson(value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw);}
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
    const grants=await db('intmed_content_publish_tokens?draft_id=eq.'+draftId+'&token_hash=eq.'+tokenHash+'&consumed_at=is.null&expires_at=gt.'+encode(new Date().toISOString())+'&select=draft_id&limit=1') as Array<Record<string,unknown>>;
    if(!grants[0])return reply(403,{message:'Capability expired or invalid'});
    if(action==='deploy'){
      const commit=clean(input.commit,80);if(!/^[0-9a-f]{40}$/.test(commit))return reply(400,{message:'Invalid release commit'});
      const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publishing&publishing_runner=eq.github-actions&select=topic_id&limit=1') as Array<Record<string,unknown>>;
      const topicId=String(rows[0]?.topic_id||'');if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(topicId))return reply(409,{message:'Publication is not active'});
      const membership=await github('intMed-study-plan/compare/'+commit+'...'+encode('claude/quirky-ride-mavb6b'));
      if(!membership.ok||!['ahead','identical'].includes(membership.value.status))return reply(409,{message:'Release does not belong to the publication branch',code:'foreign_release'});
      const manifest=await github('intMed-study-plan/contents/docs/content/manifest.json?ref='+commit);
      if(!manifest.ok||!/^[0-9a-f]{64}$/.test(String(fileJson(manifest.value)?.topics?.[topicId]?.sha256||'')))return reply(409,{message:'Release topic manifest missing'});
      for(let attempt=0;attempt<3;attempt++){
        const file=await github('gerami-website/contents/deploy/projects.json?ref=main');
        if(!file.ok)return reply(503,{message:'دسترسی مخزن میزبان برقرار نیست؛ کلید انتشار باید به gerami-website دسترسی داشته باشد.',code:'hosting_permission_required'});
        const pins=fileJson(file.value),pin=pins.intmed;
        if(pin?.repository!=='https://github.com/4mirgr/intMed-study-plan.git'||pin.mount!=='intmed'||!/^[0-9a-f]{40}$/.test(String(pin.commit||'')))return reply(409,{message:'Host source contract changed'});
        if(pin.commit===commit)return reply(202,{ok:true,alreadyRequested:true});
        const includes=await github('intMed-study-plan/compare/'+commit+'...'+pin.commit);
        if(includes.ok&&['ahead','identical'].includes(includes.value.status))return reply(202,{ok:true,alreadyRequested:true});
        const forward=await github('intMed-study-plan/compare/'+pin.commit+'...'+commit);
        if(!forward.ok||forward.value.status!=='ahead')return reply(409,{message:'Host update would diverge or roll back',code:'host_release_conflict'});
        pin.commit=commit;
        const written=await github('gerami-website/contents/deploy/projects.json','PUT',{message:'Deploy approved IntMed release '+commit.slice(0,12),branch:'main',sha:file.value.sha,content:encodedJson(pins)});
        if(written.ok)return reply(202,{ok:true,hostingCommit:written.value.commit?.sha});
        if([401,403,404].includes(written.status))return reply(503,{message:'کلید INTMED_GITHUB_ACTIONS_TOKEN به مخزن gerami-website مجوز Contents: Read and write ندارد؛ دسترسی همین مخزن را اضافه کنید.',code:'hosting_permission_required'});
        if(written.status!==409)return reply(503,{message:'شروع ساخت نسخهٔ میزبان ناموفق بود.',code:'hosting_update_failed'});
      }
      return reply(409,{message:'میزبان هم‌زمان تغییر کرد؛ انتشار را دوباره امتحان کنید.',code:'host_release_conflict'});
    }
    if(action==='claim'){
      const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publishing&publishing_runner=eq.github-actions&select=id,ingest_id,topic_id,title,source_summary,draft_json,target_category_id,target_topic_label,target_topic_is_new,target_content_kind,target_source_class,target_rights_note,intmed_content_ingest(kind,mime_type,original_filename,storage_path,content_text,caption,sha256,source_type,source_name)&limit=1') as Array<Record<string,unknown>>;
      const draft=rows[0];if(!draft)return reply(409,{message:'Draft is not assigned to GitHub Actions'});
      const item=(draft.intmed_content_ingest||{}) as Record<string,unknown>;let downloadUrl:string|null=null;
      if(item.kind!=='text'){
        const path=String(item.storage_path||'');if(!path)return reply(409,{message:'Source unavailable'});
        const signed=await fetch(base+'/storage/v1/object/sign/intmed-content-inbox/'+path.split('/').map(encode).join('/'),{method:'POST',headers:server,body:JSON.stringify({expiresIn:2700})});
        if(!signed.ok)return reply(503,{message:'Could not sign source'});
        const value=await signed.json(),relative=String(value.signedURL||value.signedUrl||'');downloadUrl=relative.startsWith('http')?relative:base+'/storage/v1'+(relative.startsWith('/')?'':'/')+relative;
      }
      return reply(200,{ok:true,job:{draftId:draft.id,ingestId:draft.ingest_id,title:draft.title,sourceSummary:draft.source_summary,draft:draft.draft_json,target:{categoryId:draft.target_category_id,topicId:draft.topic_id,topicLabel:draft.target_topic_label,isNew:!!draft.target_topic_is_new,kind:draft.target_content_kind,sourceClass:draft.target_source_class,rightsNote:draft.target_rights_note},source:{kind:item.kind,mimeType:item.mime_type,filename:clean(item.original_filename,180),sha256:item.sha256||null,contentText:item.kind==='text'?String(item.content_text||''):null,downloadUrl,sourceType:item.source_type||null,sourceName:clean(item.source_name,300)}}});
    }
    if(action==='result'){
      const ok=input.ok===true,now=new Date().toISOString();
      const patch=ok?{status:'published',published_at:now,published_commit:clean(input.commit,80),publish_error:null,updated_at:now}:{status:'publish_error',publish_error:clean(input.error||'GitHub publisher failed',1000),updated_at:now};
      if(ok&&!patch.published_commit)return reply(400,{message:'Commit is required'});
      await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publishing&publishing_runner=eq.github-actions','PATCH',patch,{'Prefer':'return=minimal'});
      await db('intmed_content_publish_tokens?draft_id=eq.'+draftId,'PATCH',{consumed_at:now},{'Prefer':'return=minimal'});
      try{await startNext();}catch{console.warn('publisher_next_wake_failed');}
      return reply(200,{ok:true,status:patch.status});
    }
    return reply(400,{message:'Unknown action'});
  }catch(error){return reply(503,{message:'Cloud publisher unavailable',code:clean(error instanceof Error?error.message:'publisher_error',180)});}
});
