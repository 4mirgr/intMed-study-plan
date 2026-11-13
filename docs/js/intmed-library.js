(function(global){
  'use strict';
  var api=null,data=null,visible=48,current=null,topicCache=new Map(),loading=null,previewObserver=null,viewerEntries=[];
  var labels={algorithm:'الگوریتم',image:'تصویر',table:'جدول',tracing:'نوار و tracing',radiology:'رادیولوژی',pathology:'پاتولوژی',pbs:'PBS · لام خون محیطی',clinical:'تصویر بالینی',chart:'نمودار'};
  function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;}
  function fa(value){return new Intl.NumberFormat('fa-IR').format(Number(value)||0);}
  function normalize(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
  function bucket(){return api&&api.state().users[api.user()]||{itemState:{}};}
  function favorite(entry){return !!((bucket().itemState||{})['library-favorite:'+entry.id]||{}).favorite;}
  function setFavorite(entry,value){if(!api||!api.ready())return;api.save('library-favorite:'+entry.id,{favorite:value,updatedAt:new Date().toISOString()});render();if(current&&current.id===entry.id)updateViewerFavorite();}
  function recentIds(){var value=(bucket().itemState||{})['library:recent'];return value&&Array.isArray(value.ids)?value.ids:[];}
  function remember(entry){if(!api||!api.ready())return;var ids=[entry.id].concat(recentIds().filter(function(id){return id!==entry.id;})).slice(0,8);api.save('library:recent',{ids:ids,updatedAt:new Date().toISOString()});renderRecent();}
  function kindLabel(kind){return labels[kind]||'محتوای تصویری';}
  function publicContentJson(path){
    var controller=typeof AbortController==='function'?new AbortController():null,timer;
    var timeoutMs=Math.max(1,Number((global.INTMED_CONFIG||{}).contentTimeoutMs)||9000);
    var expired=new Promise(function(resolve,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(new Error('public content timeout'));},timeoutMs);});
    var received=fetch(path,{cache:'no-cache',...(controller?{signal:controller.signal}:{})}).then(function(response){if(!response.ok)throw Error('content '+response.status);return response.json();});
    return Promise.race([received,expired]).finally(function(){clearTimeout(timer);});
  }
  function load(){
    if(data)return Promise.resolve(data);if(loading)return loading;
    status('در حال بارگذاری کتابخانه…');
    loading=publicContentJson('content/library.json').then(function(value){data=value;populateFilters();status('');return value;}).catch(function(error){status('بارگذاری کتابخانه انجام نشد؛ اتصال را بررسی و دوباره تلاش کنید.');throw error;}).finally(function(){loading=null;});return loading;
  }
  function status(message){var root=document.getElementById('libraryStatus');if(root)root.textContent=message;}
  function unique(key){var found=new Map();(data.entries||[]).forEach(function(entry){var value=entry[key];if(value&&!found.has(value))found.set(value,key==='categoryId'?entry.categoryLabel:value);});return Array.from(found.entries()).sort(function(a,b){return String(a[1]).localeCompare(String(b[1]),'fa');});}
  function populate(selectId,items){var select=document.getElementById(selectId),first=select.firstElementChild;select.replaceChildren(first);items.forEach(function(pair){var option=el('option',null,pair[1]);option.value=pair[0];select.appendChild(option);});}
  function populateFilters(){var kind=document.getElementById('libraryKind');if(kind&&!kind.querySelector('option[value="pbs"]')){var pbs=el('option',null,labels.pbs);pbs.value='pbs';var pathology=kind.querySelector('option[value="pathology"]');if(pathology)pathology.insertAdjacentElement('afterend',pbs);else kind.appendChild(pbs);}populate('libraryCategory',unique('categoryId'));var sources=unique('sourceTitle');if((data.entries||[]).some(function(entry){return !entry.sourceTitle;}))sources.push(['__none','بدون منبع ثبت‌شده']);populate('librarySource',sources);}
  function filtered(){
    if(!data)return[];var query=normalize(document.getElementById('librarySearch').value),words=query.split(/\s+/).filter(Boolean),kind=document.getElementById('libraryKind').value,category=document.getElementById('libraryCategory').value,source=document.getElementById('librarySource').value,sourceClass=document.getElementById('librarySourceClass').value,only=document.getElementById('libraryFavoritesOnly').checked;
    return data.entries.filter(function(entry){var hay=normalize(entry.search);return(!kind||entry.kind===kind)&&(!category||entry.categoryId===category)&&(!source||(source==='__none'?!entry.sourceTitle:entry.sourceTitle===source))&&(!sourceClass||(sourceClass==='__none'?!entry.sourceClass:entry.sourceClass===sourceClass))&&(!only||favorite(entry))&&words.every(function(word){return hay.includes(word);});}).sort(function(a,b){return Number(favorite(b))-Number(favorite(a))||a.categoryLabel.localeCompare(b.categoryLabel,'fa')||a.title.localeCompare(b.title,'fa');});
  }
  function emptyVisual(entry){var box=el('span','library-card-visual library-card-placeholder');box.dataset.kind=entry.kind;box.setAttribute('aria-hidden','true');box.innerHTML=entry.kind==='algorithm'?'<svg viewBox="0 0 48 48"><path d="M10 8h28v9H10zM24 17v8M12 25h24M12 25v8M36 25v8M7 33h10v8H7zM31 33h10v8H31z"/></svg>':'<svg viewBox="0 0 48 48"><path d="M7 9h34v30H7z"/><path d="m11 34 10-11 7 7 5-5 5 9"/></svg>';return box;}
  function card(entry){
    var article=el('article','library-card');article.dataset.libraryId=entry.id;
    var open=el('button','library-card-open');open.type='button';open.setAttribute('aria-label','بازکردن '+entry.title);
    if(entry.thumbnail){var img=el('img','library-card-visual');img.src=entry.thumbnail;img.alt='';img.loading='lazy';img.decoding='async';img.addEventListener('error',function(){img.replaceWith(emptyVisual(entry));});open.appendChild(img);}else{var placeholder=emptyVisual(entry);open.appendChild(placeholder);placeholder._libraryEntry=entry;if(global.IntersectionObserver){if(!previewObserver)previewObserver=new IntersectionObserver(function(records){records.forEach(function(record){if(record.isIntersecting){previewObserver.unobserve(record.target);preparePreview(record.target,record.target._libraryEntry);}});},{rootMargin:'180px'});previewObserver.observe(placeholder);}else setTimeout(function(){preparePreview(placeholder,entry);},0);}
    var copy=el('span','library-card-copy'),badge=el('span','library-kind',kindLabel(entry.kind)),title=el('strong',null,entry.title),meta=el('small',null,entry.categoryLabel+' · '+entry.topicLabel);copy.append(badge,title,meta);if(entry.sourceTitle)copy.appendChild(el('small','library-source',entry.sourceTitle+(entry.sourcePages?' · ص '+entry.sourcePages:'')));open.appendChild(copy);open.addEventListener('click',function(){openViewer(entry);});
    var fav=el('button','library-card-favorite',favorite(entry)?'★':'☆');fav.type='button';fav.title=favorite(entry)?'حذف نشان':'نشان‌کردن';fav.setAttribute('aria-label',fav.title+' '+entry.title);fav.setAttribute('aria-pressed',String(favorite(entry)));fav.addEventListener('click',function(){setFavorite(entry,!favorite(entry));});article.append(open,fav);return article;
  }
  function render(){
    if(!data)return;if(previewObserver)previewObserver.disconnect();var entries=filtered(),grid=document.getElementById('libraryGrid');grid.replaceChildren();entries.slice(0,visible).forEach(function(entry){grid.appendChild(card(entry));});
    status(entries.length?fa(entries.length)+' مورد پیدا شد.':'موردی با این فیلتر پیدا نشد.');var more=document.getElementById('libraryMore');more.hidden=entries.length<=visible;if(!more.hidden)more.textContent='نمایش '+fa(Math.min(48,entries.length-visible))+' مورد دیگر';renderRecent();
  }
  function renderRecent(){var root=document.getElementById('libraryRecent');if(!root||!data)return;var ids=recentIds(),entries=ids.map(function(id){return data.entries.find(function(entry){return entry.id===id;});}).filter(Boolean);root.hidden=!entries.length;var list=root.querySelector('.library-recent-list');list.replaceChildren();entries.slice(0,5).forEach(function(entry){var button=el('button',null,entry.title);button.type='button';button.addEventListener('click',function(){openViewer(entry);});list.appendChild(button);});}
  function topic(entry){if(topicCache.has(entry.topicId))return topicCache.get(entry.topicId);var request=publicContentJson('content/topics/'+encodeURIComponent(entry.topicId)+'.json').catch(function(error){topicCache.delete(entry.topicId);throw error;});topicCache.set(entry.topicId,request);return request;}
  function preparePreview(node,entry){
    if(!node.isConnected)return;topic(entry).then(function(payload){if(!node.isConnected)return;var item=(payload[entry.field]||[]).find(function(row){return row.id===entry.itemId;});if(!item)return;var preview;
      if(entry.field==='images'&&item.sourceUrl){preview=el('img','library-card-visual');preview.src=item.sourceUrl;preview.alt='';preview.loading='lazy';preview.decoding='async';preview.addEventListener('error',function(){preview.replaceWith(emptyVisual(entry));});}
      else{preview=el('span','library-card-visual library-card-preview');preview.setAttribute('aria-hidden','true');if(entry.field==='tables')preview.appendChild(markdownTable(item.markdown,true));else{var steps=el('ol','library-preview-steps');(item.steps||[]).slice(0,3).forEach(function(step){var row=el('li');row.append(el('strong',null,step.prompt),el('span',null,step.expectedAnswer));steps.appendChild(row);});preview.appendChild(steps);}}
      node.replaceWith(preview);
    }).catch(function(){node.title='پیش‌نمایش دریافت نشد؛ برای تلاش دوباره مورد را باز کنید.';});
  }
  function markdownTable(value,preview){
    var lines=String(value||'').split(/\r?\n/).filter(function(line){return line.trim().startsWith('|');});if(preview)lines=lines.slice(0,5);if(lines.length<2)return el('pre','library-structured',String(value||'').slice(0,preview?600:undefined));
    var table=el('table','library-structured-table'),head=true;lines.forEach(function(line,index){if(index===1&&/^\|?[\s:|-]+\|?$/.test(line))return;var tr=el('tr');line.replace(/^\||\|$/g,'').split('|').forEach(function(cell){var node=el(head?'th':'td',null,cell.trim());tr.appendChild(node);});table.appendChild(tr);head=false;});var wrap=el('div','library-table-scroll');wrap.appendChild(table);return wrap;
  }
  function imageAttribution(body,item){
    var text=[item.credit,item.licenseLabel].filter(Boolean).join(' · ')||item.copyright;
    if(text)body.appendChild(el('p','library-viewer-source',text));
    [[item.originUrl,'صفحهٔ منبع تصویر'],[item.licenseUrl,'شرایط مجوز']].forEach(function(pair){
      if(!/^https?:\/\//i.test(String(pair[0]||'')))return;
      var p=el('p','library-viewer-source'),link=el('a',null,pair[1]);link.href=pair[0];link.target='_blank';link.rel='noopener noreferrer';p.appendChild(link);body.appendChild(p);
    });
    if(item.changesNote)body.appendChild(el('p','library-viewer-source',item.changesNote));
    if(item.reviewStatus==='draft')body.appendChild(el('p','library-viewer-source','شرح آموزشی پیش‌نویس است و به بازبینی مدرس نیاز دارد.'));
  }
  function renderViewer(entry,payload){
    var body=document.getElementById('libraryViewerBody');body.replaceChildren();var item=(payload[entry.field]||[]).find(function(candidate){return candidate.id===entry.itemId;});if(!item){body.textContent='این مورد در نسخهٔ فعلی مبحث پیدا نشد.';return;}
    if(entry.field==='images'){var img=el('img','library-viewer-image');img.src=item.sourceUrl||entry.thumbnail;img.alt=item.caption||entry.title;body.appendChild(img);if(item.note)body.appendChild(el('p','library-viewer-note',item.note));imageAttribution(body,item);}
    else if(entry.field==='tables')body.appendChild(markdownTable(item.markdown));
    else {if(item.vignette)body.appendChild(el('p','library-viewer-note',item.vignette));var list=el('ol','library-algorithm-steps');(item.steps||[]).forEach(function(step){var li=el('li');li.append(el('strong',null,step.prompt),el('p',null,step.expectedAnswer));list.appendChild(li);});body.appendChild(list);}
    if(entry.sourceTitle||entry.sourcePages){body.appendChild(el('p','library-viewer-source','منبع: '+(entry.sourceTitle||'ثبت‌شده در مبحث')+(entry.sourcePages?' · صفحه '+entry.sourcePages:'')));}
  }
  function updateViewerFavorite(){var button=document.getElementById('libraryViewerFavorite');if(!current)return;button.textContent=favorite(current)?'★ نشان‌شده':'☆ نشان‌کردن';button.setAttribute('aria-pressed',String(favorite(current)));}
  function updateNavigation(){var index=current?viewerEntries.findIndex(function(entry){return entry.id===current.id;}):-1;document.getElementById('libraryViewerPrevious').disabled=index<=0;document.getElementById('libraryViewerNext').disabled=index<0||index>=viewerEntries.length-1;document.getElementById('libraryViewerPosition').textContent=index<0?'':fa(index+1)+' از '+fa(viewerEntries.length);}
  function moveViewer(step){if(!current)return;var index=viewerEntries.findIndex(function(entry){return entry.id===current.id;}),next=index+step;if(index>=0&&next>=0&&next<viewerEntries.length)openViewer(viewerEntries[next],true);}
  function openViewer(entry,navigating){
    if(!navigating){var entries=filtered();viewerEntries=entries.some(function(item){return item.id===entry.id;})?entries:[entry];}
    current=entry;document.getElementById('libraryViewerTitle').textContent=entry.title;document.getElementById('libraryViewerMeta').textContent=kindLabel(entry.kind)+' · '+entry.topicLabel;var body=document.getElementById('libraryViewerBody');body.textContent='در حال دریافت جزئیات…';updateViewerFavorite();remember(entry);history.replaceState(null,'','#library='+encodeURIComponent(entry.id));
    updateNavigation();var dialog=document.getElementById('libraryViewer');body.scrollTop=0;if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}topic(entry).then(function(payload){if(current&&current.id===entry.id)renderViewer(entry,payload);}).catch(function(){if(current&&current.id===entry.id){body.textContent='دریافت جزئیات انجام نشد. ';var retry=el('button','secondary-action','تلاش مجدد');retry.type='button';retry.addEventListener('click',function(){openViewer(entry,true);});body.appendChild(retry);}});
  }
  function closeViewer(){var dialog=document.getElementById('libraryViewer');if(dialog.open&&dialog.close)dialog.close();else dialog.removeAttribute('open');current=null;viewerEntries=[];if(location.hash.indexOf('#library=')===0)history.replaceState(null,'',location.pathname+location.search);}
  function openTopic(){if(!current||!api)return;var type=current.field==='kfPmp'?'kfPmp':current.field;var entry=current;closeViewer();api.open(entry.topicId,type,entry.itemId);}
  function revealHash(){if(!data||location.hash.indexOf('#library=')!==0)return;var id=decodeURIComponent(location.hash.slice(9)),entry=data.entries.find(function(item){return item.id===id;});if(entry)openViewer(entry);}
  function init(options){
    var viewer=document.getElementById('libraryViewer');document.getElementById('libraryViewerPrevious').addEventListener('click',function(){moveViewer(-1);});document.getElementById('libraryViewerNext').addEventListener('click',function(){moveViewer(1);});viewer.addEventListener('cancel',function(event){event.preventDefault();closeViewer();});viewer.addEventListener('keydown',function(event){if(!viewer.open||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();moveViewer(event.key==='ArrowRight'?1:-1);}});
    api=options;document.getElementById('libraryFilters').addEventListener('input',function(){visible=48;render();});document.getElementById('libraryMore').addEventListener('click',function(){visible+=48;render();});document.querySelector('#libraryViewer .library-viewer-close').addEventListener('click',closeViewer);document.getElementById('libraryViewer').addEventListener('click',function(event){if(event.target===event.currentTarget)closeViewer();});document.getElementById('libraryViewerFavorite').addEventListener('click',function(){if(current)setFavorite(current,!favorite(current));});document.getElementById('libraryViewerTopic').addEventListener('click',openTopic);
  }
  function show(){return load().then(function(){render();revealHash();});}
  global.IntMedLibrary={init:init,show:show,render:render,normalize:normalize};
})(window);
