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
  let input:Record<string,unknown>;try{input=await req.json();}catch{return reply(400,{message:'Invalid JSON'});}
  const action=clean(input.action,30),draftId=clean(input.draftId,40);
  if(!uuid.test(draftId))return reply(400,{message:'Invalid draft'});
  try{
    if(action==='dispatch'){
      if(req.headers.get('authorization')!=='Bearer '+service)return reply(403,{message:'Internal dispatch only'});
      const githubToken=Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN');
      if(!githubToken)return reply(503,{message:'کلید انتشار GitHub هنوز در Secrets پروژه تنظیم نشده است.',code:'github_token_missing'});
      const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publish_requested&select=id,title&limit=1') as Array<Record<string,unknown>>;
      if(!rows[0])return reply(409,{message:'Draft is not queued for cloud publication'});
      const token=capability(),tokenHash=await digest(token),expires=new Date(Date.now()+45*60*1000).toISOString();
      await db('intmed_content_publish_tokens?draft_id=eq.'+draftId,'DELETE',undefined,{'Prefer':'return=minimal'});
      await db('intmed_content_publish_tokens','POST',{draft_id:draftId,token_hash:tokenHash,expires_at:expires},{'Prefer':'return=minimal'});
      // Assign the job before dispatch so a fast Actions runner cannot race this update,
      // and the retired localhost publisher cannot claim it in the meantime.
      await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publish_requested','PATCH',{status:'publishing',publishing_started_at:new Date().toISOString(),publishing_runner:'github-actions',publish_error:null,updated_at:new Date().toISOString()},{'Prefer':'return=minimal'});
      const dispatched=await fetch('https://api.github.com/repos/4mirgr/intMed-study-plan/actions/workflows/publish-content.yml/dispatches',{
        method:'POST',headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
        body:JSON.stringify({ref:'claude/quirky-ride-mavb6b',inputs:{draft_id:draftId,capability:token}})
      });
      if(!dispatched.ok){
        const detail=clean(await dispatched.text(),240);
        await db('intmed_content_drafts?id=eq.'+draftId,'PATCH',{status:'publish_error',publish_error:'GitHub Actions dispatch failed ('+dispatched.status+'): '+detail,updated_at:new Date().toISOString()},{'Prefer':'return=minimal'});
        return reply(502,{message:'شروع انتشار GitHub ناموفق بود.',code:'github_dispatch_'+dispatched.status});
      }
      return reply(202,{ok:true,status:'publishing',message:'انتشار ابری شروع شد؛ نتیجه به‌صورت خودکار در همین پنل نمایش داده می‌شود.'});
    }
    const token=clean(input.capability,80),tokenHash=await digest(token);
    if(!hex.test(token)||!hex.test(tokenHash))return reply(403,{message:'Invalid capability'});
    const grants=await db('intmed_content_publish_tokens?draft_id=eq.'+draftId+'&token_hash=eq.'+tokenHash+'&consumed_at=is.null&expires_at=gt.'+encode(new Date().toISOString())+'&select=draft_id&limit=1') as Array<Record<string,unknown>>;
    if(!grants[0])return reply(403,{message:'Capability expired or invalid'});
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
      return reply(200,{ok:true,status:patch.status});
    }
    return reply(400,{message:'Unknown action'});
  }catch(error){return reply(503,{message:'Cloud publisher unavailable',code:clean(error instanceof Error?error.message:'publisher_error',180)});}
});
