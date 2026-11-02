// Stage-two generator: creates only the artifacts explicitly selected by the administrator.
// It is service-only and never approves or publishes medical content.
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const safe=(value:unknown,limit:number)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const b64=(bytes:Uint8Array)=>{let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);};

Deno.serve(async req=>{
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),key=Deno.env.get('GEMINI_API_KEY');
  if(!base||!service||!key)return reply(503,{message:'سرویس تولید مرحلهٔ دوم تنظیم نشده است.'});
  if((req.headers.get('authorization')||'')!=='Bearer '+service)return reply(401,{message:'Service authorization required'});
  let input:Record<string,unknown>;try{input=await req.json();}catch{return reply(400,{message:'Invalid JSON'});}
  const draftId=safe(input.draftId,40),requested=Array.isArray(input.outputs)?input.outputs.map(value=>safe(value,20)):[],allowed=new Set(['lesson','flashcards','mcq','kf']),outputs=[...new Set(requested.filter(value=>allowed.has(value)))];
  if(!/^[0-9a-f-]{36}$/i.test(draftId)||!outputs.length)return reply(400,{message:'حداقل یک خروجی معتبر انتخاب کنید.'});
  const sh={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path:string,method='GET',value?:unknown,extra:Record<string,string>={}){const response=await fetch(base+'/rest/v1/'+path,{method,headers:{...sh,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});const text=await response.text();if(!response.ok)throw Error('database_'+response.status);return response.status===204?null:JSON.parse(text||'null');}
  try{
    const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&select=id,ingest_id,status,title,source_summary,draft_json,review_revision&limit=1') as Array<Record<string,unknown>>,draft=rows[0];
    if(!draft||!['draft_ready','approved','publish_error'].includes(String(draft.status||'')))return reply(409,{message:'این پیش‌نویس اکنون قابل تولید نیست.'});
    const ingests=await db('intmed_content_ingest?id=eq.'+encodeURIComponent(String(draft.ingest_id||''))+'&select=id,kind,mime_type,original_filename,storage_path,content_text,caption,byte_size&limit=1') as Array<Record<string,unknown>>,ingest=ingests[0];
    if(!ingest)return reply(404,{message:'منبع اصلی پیدا نشد.'});
    const existing=draft.draft_json&&typeof draft.draft_json==='object'&&!Array.isArray(draft.draft_json)?draft.draft_json as Record<string,unknown>:{};
    const labels:{[key:string]:string}={lesson:'درسنامهٔ منظم و نسبتاً کامل',flashcards:'فلش‌کارت‌های نکته‌محور',mcq:'سؤال‌های چهارگزینه‌ای با پاسخ تشریحی',kf:'سناریوهای KF/PMP'};
    const instruction='شما مرحلهٔ دوم تولید محتوای پزشکی IntMed هستید. فقط این خروجی‌ها را بسازید: '+outputs.map(value=>labels[value]).join('، ')+'. فارسی روان و دقیق بنویسید، صرفاً به منبع متصل تکیه کنید، ادعای تازه نسازید و از تکرار بپرهیزید. درسنامه حداکثر ۲۰ بند، فلش‌کارت حداکثر ۱۲، سؤال چهارگزینه‌ای حداکثر ۱۰ و KF/PMP حداکثر ۵ مورد باشد. تحلیل مرحلهٔ اول:\n'+JSON.stringify({title:draft.title,summary:draft.source_summary,sourceEvidence:existing.sourceEvidence,medicalWarnings:existing.medicalWarnings,insufficientEvidence:existing.insufficientEvidence,outline:existing.lessonOutline});
    const properties:Record<string,unknown>={},required:string[]=[];
    if(outputs.includes('lesson')){required.push('lessonOutline');properties.lessonOutline={type:'array',maxItems:20,items:{type:'string'}};}
    if(outputs.includes('flashcards')){required.push('flashcardDrafts');properties.flashcardDrafts={type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['front','back','tags'],properties:{front:{type:'string'},back:{type:'string'},tags:{type:'array',maxItems:5,items:{type:'string'}}}}};}
    if(outputs.includes('mcq')){required.push('mcqDrafts');properties.mcqDrafts={type:'array',maxItems:10,items:{type:'object',additionalProperties:false,required:['stem','options','correctIndex','explanation'],properties:{stem:{type:'string'},options:{type:'array',minItems:4,maxItems:4,items:{type:'string'}},correctIndex:{type:'integer',minimum:0,maximum:3},explanation:{type:'string'}}}};}
    if(outputs.includes('kf')){required.push('kfDrafts');properties.kfDrafts={type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['prompt','expectedAnswer'],properties:{prompt:{type:'string'},expectedAnswer:{type:'string'}}}};}
    const schema={type:'object',additionalProperties:false,required,properties},parts:Array<Record<string,unknown>>=[{text:instruction}];
    if(ingest.kind==='text')parts.push({text:'\nمتن منبع:\n'+String(ingest.content_text||'').slice(0,80000)});
    else{
      if(!ingest.storage_path||Number(ingest.byte_size||0)>20971520)throw Error('source_size');
      const file=await fetch(base+'/storage/v1/object/intmed-content-inbox/'+ingest.storage_path,{headers:{apikey:service,Authorization:'Bearer '+service}});if(!file.ok)throw Error('source_download');
      const bytes=new Uint8Array(await file.arrayBuffer());if(!bytes.length||bytes.length>20971520)throw Error('source_size');
      parts.push({inlineData:{mimeType:ingest.mime_type,data:b64(bytes)}});
    }
    const configured=Deno.env.get('INTMED_GEMINI_MODEL'),model=!configured||configured==='gemini-2.5-flash'?'gemini-3.1-flash-lite':configured;
    const ai=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0.15,maxOutputTokens:6144,responseMimeType:'application/json',responseJsonSchema:schema}})}),responseText=await ai.text();
    if(!ai.ok){let detail:Record<string,unknown>={};try{detail=JSON.parse(responseText);}catch{}return reply(ai.status===429?429:502,{message:ai.status===429?'سهمیهٔ موقت مدل پر است؛ بعداً دوباره تلاش کنید.':'مدل مرحلهٔ دوم پاسخ معتبر نداد.',code:safe((detail.error as Record<string,unknown>)?.status||'provider_'+ai.status,80)});}
    const response=JSON.parse(responseText),raw=String(response.candidates?.[0]?.content?.parts?.map((part:Record<string,unknown>)=>part.text||'').join('')||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''),generated=JSON.parse(raw),merged={...existing,...generated,generation:{phase:'generated',generated:[...new Set([...(Array.isArray((existing.generation as Record<string,unknown>)?.generated)?(existing.generation as Record<string,unknown>).generated as string[]:[]),...outputs])],available:['lesson','flashcards','mcq','kf'],model,updatedAt:new Date().toISOString()}};
    await db('intmed_content_drafts?id=eq.'+draftId,'PATCH',{draft_json:merged,provider:'gemini',model,error_code:null,review_revision:Number(draft.review_revision||0)+1,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
    const refreshed=await db('intmed_content_drafts?id=eq.'+draftId+'&select=*&limit=1');
    return reply(200,{ok:true,draft:refreshed[0],generated:outputs,message:'خروجی‌های انتخاب‌شده ساخته شد و برای بازبینی آماده است.'});
  }catch(error){return reply(503,{message:'تولید مرحلهٔ دوم انجام نشد.',code:safe(error instanceof Error?error.message:'generation_error',100)});}
});
