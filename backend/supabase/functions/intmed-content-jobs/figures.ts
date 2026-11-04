// Binary validation and private persistence. No model calls or caller-selected paths.
const figureCrcTable=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);return crc>>>0;});
export async function saveFigure(input,job,{db,base,server,fetcher=fetch}){
  const fail=()=>{throw Error('figure_invalid');};
  if(job.kind!=='extract'||job.progress?.validationOnly===true)fail();
  const manifest=job.progress?.nativeFigureManifest;
  if(!manifest||input.page>manifest.pageCount||!manifest.figures.some(figure=>['page','xref','width','height','sha256'].every(key=>figure[key]===input[key])))fail();
  if(!Number.isInteger(input.page)||input.page<1||input.page>2000||!Number.isInteger(input.xref)||input.xref<1||
    typeof input.imageBase64!=='string'||input.imageBase64.length>6990508||! /^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64))fail();
  let bytes;try{bytes=Uint8Array.from(atob(input.imageBase64),character=>character.charCodeAt(0));}catch{fail();}
  if(!bytes.length||bytes.length>5*1024*1024)fail();
  const view=new DataView(bytes.buffer);let width=0,height=0,mime='',extension='';
  if(bytes.length>=33&&bytes.slice(0,8).every((byte,index)=>byte===[137,80,78,71,13,10,26,10][index])&&view.getUint32(8)===13&&view.getUint32(12)===0x49484452){
    width=view.getUint32(16);height=view.getUint32(20);mime='image/png';extension='png';
    // Bounded structural checks: do not inflate potentially huge images on Edge.
    let offset=8,ended=false,idat=false,header=false,palette=false,compressed=0;
    while(offset+12<=bytes.length){
      const length=view.getUint32(offset),type=view.getUint32(offset+4),end=offset+12+length;
      if(end>bytes.length)fail();
      let crc=0xffffffff;
      for(let index=offset+4;index<end-4;index++)crc=(crc>>>8)^figureCrcTable[(crc^bytes[index])&255];
      if(((crc^0xffffffff)>>>0)!==view.getUint32(end-4))fail();
      if(type===0x49484452){
        if(header||offset!==8||length!==13)fail();header=true;
        const depth=bytes[offset+16],color=bytes[offset+17];
        if(!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[color]?.includes(depth))||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]>1)fail();
      }else if(type===0x504c5445){if(idat||!length||length%3||length>768)fail();palette=true;}
      else if(type===0x49444154){if(bytes[25]===3&&!palette)fail();idat=true;compressed+=length;}
      else if(type===0x49454e44){ended=length===0&&end===bytes.length;offset=end;break;}
      else if(!(bytes[offset+4]&32))fail();
      offset=end;
    }
    if(!ended||!idat||compressed<6)fail();
  }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
    let offset=2,scanned=false,entropy=0,ended=false;
    while(offset<bytes.length){
      if(bytes[offset++]!==255)fail();while(bytes[offset]===255)offset++;
      if(offset>=bytes.length)fail();const marker=bytes[offset++];
      if(marker===0xd9){ended=offset===bytes.length;break;}
      if(marker===0||marker===0xd8||marker>=0xd0&&marker<=0xd7)fail();
      if(marker===1)continue;
      if(offset+2>bytes.length)fail();const length=view.getUint16(offset);
      if(length<2||offset+length>bytes.length)fail();
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(width||length<8||length!==8+3*bytes[offset+7])fail();height=view.getUint16(offset+3);width=view.getUint16(offset+5);
      }
      if(marker===0xda){
        if(!width||length<6||length!==6+2*bytes[offset+2])fail();scanned=true;offset+=length;
        while(offset<bytes.length){
          if(bytes[offset]!==255){entropy++;offset++;continue;}
          let next=offset+1;while(bytes[next]===255)next++;
          if(next>=bytes.length)fail();
          if(bytes[next]===0||bytes[next]>=0xd0&&bytes[next]<=0xd7){entropy++;offset=next+1;continue;}
          break;
        }
      }else offset+=length;
    }
    if(!scanned||!entropy||!ended)fail();
    mime='image/jpeg';extension='jpg';
  }else fail();
  if(width!==input.width||height!==input.height||Math.min(width,height)<128||width*height>100000000)fail();
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(sha!==input.sha256)fail();
  const rows=await db('intmed_content_figures?ingest_id=eq.'+job.ingest_id+'&select=*');
  const prior=rows.find(row=>row.sha256===sha&&row.page===input.page);
  if(prior?.stored)return {figureId:prior.id,cached:true};
  if(!prior&&(rows.length>=80||rows.reduce((sum,row)=>sum+row.byte_size,0)+bytes.length>30*1024*1024))throw Error('figure_storage_limit');
  const storage_path='figures/'+job.ingest_id+'/'+sha+'.'+extension;
  // Reserve quota atomically before writing any binary. Pending reservations
  // survive ambiguous network failures and the next idempotent retry completes them.
  let row=prior;
  if(!row){
    const saved=await db('intmed_content_figures?on_conflict=ingest_id,sha256,page','POST',{ingest_id:job.ingest_id,job_id:job.id,page:input.page,xref:input.xref,width,height,sha256:sha,storage_path,mime_type:mime,byte_size:bytes.length,stored:false},{Prefer:'resolution=ignore-duplicates,return=representation'});
    row=saved?.[0]||(await db('intmed_content_figures?ingest_id=eq.'+job.ingest_id+'&sha256=eq.'+sha+'&page=eq.'+input.page))[0];
  }
  if(!row)throw Error('figure_save_failed');
  const stored=await fetcher(base+'/storage/v1/object/intmed-content-inbox/'+storage_path,{method:'POST',headers:{...server,'Content-Type':mime,'x-upsert':'true'},body:bytes});
  if(!stored.ok)throw Error('figure_storage_failed');
  await db('intmed_content_figures?id=eq.'+row.id,'PATCH',{stored:true},{Prefer:'return=minimal'});
  return {figureId:row.id,cached:false};
}
