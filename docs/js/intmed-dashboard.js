(function(global){
  'use strict';
  var api=null,current=null,lastTick=Date.now(),lastInteraction=Date.now(),lastOpens={},lastExport=[];
  var TAGS=['مهم','نیاز به مرور','مطالعه‌شده'];
  function number(n){return new Intl.NumberFormat('fa-IR').format(Math.max(0,Math.round(n||0)));}
  function day(time){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time||Date.now()));}
  function dateLabel(key){return new Intl.DateTimeFormat('fa-IR',{weekday:'short',timeZone:'Asia/Tehran'}).format(new Date(key+'T12:00:00Z'));}
  function duration(n){return n<60?number(n)+' ثانیه':number(n/60)+' دقیقه';}
  function bucket(){return api.state().users[api.user()]||{itemState:{},highlights:{},profile:{}};}
  function tags(b,id){var value=(b.itemState||{})['tag:'+id];return value&&Array.isArray(value.tags)?value.tags.filter(function(t){return TAGS.includes(t);}):[];}
  function aggregate(b,range){
    var topics=api.topics(),result={topics:{},days:{},seconds:0,opens:0,highlights:0,notes:0,completed:0,favorites:0,quiz:{total:0,correct:0},status:{'ضعیف':0,'متوسط':0,'خوب':0,'نامشخص':0}};
    Object.keys(topics).forEach(function(id){
      var item=(b.itemState||{})[id]||{},t=tags(b,id);result.status[item.status||'نامشخص']=(result.status[item.status||'نامشخص']||0)+1;
      if(t.includes('مطالعه‌شده'))result.completed++;if(((b.itemState||{})['favorite:'+id]||{}).favorite)result.favorites++;
      if(item.note)result.notes++;(b.highlights&&b.highlights[id]||[]).forEach(function(h){result.highlights++;if(h.note)result.notes++;});
    });
    Object.keys(b.itemState||{}).forEach(function(key){
      var quiz=/^quiz:([^:]+):(.+)$/.exec(key);if(quiz&&topics[quiz[1]]){result.quiz.total++;if(b.itemState[key].firstCorrect===true)result.quiz.correct++;return;}
      var match=/^activity:(.+):(\d{4}-\d{2}-\d{2})$/.exec(key);if(!match||!topics[match[1]])return;
      var id=match[1],d=match[2],age=(Date.parse(day()+'T12:00:00Z')-Date.parse(d+'T12:00:00Z'))/86400000;
      if(age<0||(range!=='all'&&age>=Number(range)))return;
      var entry=b.itemState[key]||{},seconds=Math.max(0,Number(entry.seconds)||0),opens=Math.max(0,Number(entry.opens)||0);
      var topic=result.topics[id]||(result.topics[id]={opens:0,seconds:0,lastOpenedAt:'',types:{}});
      topic.opens+=opens;topic.seconds+=seconds;if((entry.lastOpenedAt||'')>topic.lastOpenedAt)topic.lastOpenedAt=entry.lastOpenedAt;
      Object.keys(entry.types||{}).forEach(function(type){topic.types[type]=(topic.types[type]||0)+(Number(entry.types[type])||0);});
      var daily=result.days[d]||(result.days[d]={opens:0,seconds:0});daily.opens+=opens;daily.seconds+=seconds;result.seconds+=seconds;result.opens+=opens;
    });return result;
  }
  function metric(root,label,value,caption){var card=document.createElement('article');card.className='metric-card';var title=document.createElement('span');title.textContent=label;var amount=document.createElement('strong');amount.textContent=value;var sub=document.createElement('small');sub.textContent=caption||'';card.append(title,amount,sub);root.appendChild(card);}
  function link(root,id,caption){var button=document.createElement('button');button.type='button';button.className='insight-topic';button.dataset.insightTopic=id;var label=document.createElement('span');label.textContent=api.topics()[id].label;var sub=document.createElement('small');sub.textContent=caption||'';button.append(label,sub);button.addEventListener('click',function(){api.goto(id);});root.appendChild(button);}
  function empty(root,message){var p=document.createElement('p');p.className='section-caption';p.textContent=message;root.appendChild(p);}
  function week(root,days){root.replaceChildren();var keys=[];for(var i=6;i>=0;i--)keys.push(day(Date.now()-i*86400000));var max=Math.max(1,...keys.map(function(k){return (days[k]||{}).seconds||0;}));keys.forEach(function(k){var value=(days[k]||{}).seconds||0,bar=document.createElement('div');bar.className='week-column';bar.setAttribute('aria-label',k+'، '+duration(value));var amount=document.createElement('small');amount.textContent=number(value/60);var track=document.createElement('div');track.className='week-track';var fill=document.createElement('span');fill.style.height=Math.max(value?3:0,value/max*100)+'%';track.appendChild(fill);var label=document.createElement('span');label.textContent=dateLabel(k);bar.append(amount,track,label);root.appendChild(bar);});}
  function bars(root,rows,unit){root.replaceChildren();if(!rows.length){empty(root,'هنوز داده‌ای برای این بازه و معیار ثبت نشده است.');return;}var max=Math.max(1,...rows.map(function(r){return r.value;}));rows.forEach(function(row){var button=document.createElement(row.id?'button':'div');if(row.id){button.type='button';button.addEventListener('click',function(){api.goto(row.id);});}button.className='analytics-bar';button.style.setProperty('--bar-width',row.value/max*100+'%');var name=document.createElement('span');name.textContent=row.label;var amount=document.createElement('b');amount.textContent=unit==='seconds'?duration(row.value):number(row.value)+' '+unit;button.append(name,amount);root.appendChild(button);});}
  function renderAnnotations(){
    var b=bucket(),topics=api.topics(),notes=[],highlights=[],legacy={};
    (api.phases?api.phases():[]).forEach(function(phase){(phase.items||[]).forEach(function(item){legacy[item.id]={label:item.text||item.title||item.id,categoryLabel:phase.title};});});
    function source(id,h){var topic=topics[id]||legacy[id]||{label:'مبحث قدیمی',categoryLabel:'آرشیو شخصی'},loc=String(h&&h.loc||'');return {id:id,highlight:h&&h.id,label:topic.label,category:topic.categoryLabel||'',kind:!h?'یادداشت مبحث':loc.startsWith('lesson:')?'درسنامه':loc.startsWith('fc')?'فلش‌کارت':loc.startsWith('mcq:')?'آزمون چهارگزینه‌ای':loc.startsWith('kf:')?'KF و PMP':loc.startsWith('table:')?'جدول':'هایلایت ذخیره‌شده'};}
    Object.keys(b.itemState||{}).forEach(function(id){var item=b.itemState[id];if(item&&typeof item.note==='string'&&item.note.trim())notes.push(Object.assign(source(id),{text:item.note}));});
    Object.keys(b.highlights||{}).forEach(function(id){var entries=b.highlights[id];if(!Array.isArray(entries))return;entries.forEach(function(h){if(!h)return;var item=source(id,h);if(h.quote)highlights.push(Object.assign({},item,{text:h.quote,color:h.color,hasNote:!!h.note}));if(h.note)notes.push(Object.assign({},item,{text:h.note,context:h.quote}));});});
    function normalize(value){return String(value||'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f]/g,'').toLocaleLowerCase().trim();}
    var query=normalize(document.getElementById('annotationSearch').value);
    function list(rootId,countId,items,isHighlight){
      var root=document.getElementById(rootId);root.replaceChildren();var filtered=items.filter(function(item){return normalize([item.text,item.context,item.label,item.category,item.kind].join(' ')).includes(query);});document.getElementById(countId).textContent=number(filtered.length);
      filtered.forEach(function(item){var card=document.createElement('article');card.className='annotation-card';var heading=document.createElement('h4');heading.textContent=[item.category,item.label,item.kind].filter(Boolean).join(' · ');var text=document.createElement(isHighlight?'mark':'p');text.className='annotation-text';if(isHighlight)text.className+=' hl hl-'+(['yellow','green','blue','pink','purple','orange'].includes(item.color)?item.color:'yellow');text.textContent=item.text;card.append(heading,text);
        if(item.context){var quote=document.createElement('blockquote');quote.className='annotation-context';quote.textContent=item.context;card.appendChild(quote);}if(item.hasNote){var hint=document.createElement('small');hint.textContent='دارای یادداشت در فهرست یادداشت‌ها';card.appendChild(hint);}
        var button=document.createElement('button');button.type='button';button.className='annotation-open';button.textContent='رفتن به محل اصلی';button.setAttribute('aria-label','رفتن به '+item.label+'، '+item.kind);button.disabled=!topics[item.id];
        var status=document.createElement('small');status.setAttribute('role','status');if(button.disabled)status.textContent='متن شما محفوظ است؛ مبحث اصلی فعلاً در دسترس نیست.';
        button.addEventListener('click',function(){button.disabled=true;Promise.resolve().then(function(){return api.annotation(item.id,item.highlight);}).catch(function(){status.textContent='بازکردن مبحث انجام نشد؛ دوباره تلاش کنید.';}).finally(function(){button.disabled=false;});});card.append(button,status);root.appendChild(card);
      });if(!filtered.length)empty(root,query?'موردی با این جست‌وجو پیدا نشد.':isHighlight?'هایلایت‌های شخصی شما اینجا نمایش داده می‌شوند.':'یادداشت‌های مبحث و نوشته‌های کنار هایلایت‌ها اینجا نمایش داده می‌شوند.');
    }
    list('personalNotes','personalNotesCount',notes,false);list('personalHighlights','personalHighlightsCount',highlights,true);
  }
  function render(){
    if(!api)return;var b=bucket(),all=aggregate(b,'all'),metrics=document.getElementById('studyMetrics');if(!metrics)return;metrics.replaceChildren();
    document.getElementById('studyGreeting').textContent=(b.profile&&b.profile.fullName)?'سلام، '+b.profile.fullName:'مسیر یادگیری من';
    metric(metrics,'مباحث مطالعه‌شده',number(all.completed),'با علامت‌گذاری خودتان');metric(metrics,'زمان فعال مطالعه',duration(all.seconds),'از شروع ثبت فعالیت');metric(metrics,'هایلایت و یادداشت',number(all.highlights+all.notes),'در حساب شخصی شما');metric(metrics,'علاقه‌مندی‌ها',number(all.favorites),'میان‌بر به مباحث محبوب');
    week(document.getElementById('studyWeekChart'),all.days);
    var recent=document.getElementById('studyRecent');recent.replaceChildren();var recentIds=Object.keys(all.topics).sort(function(a,b){return all.topics[b].lastOpenedAt.localeCompare(all.topics[a].lastOpenedAt);}).slice(0,5);
    recentIds.forEach(function(id){link(recent,id,number(all.topics[id].opens)+' بار بازشدن · '+duration(all.topics[id].seconds));});if(!recentIds.length)empty(recent,'با بازکردن درسنامه یا آزمون، مسیر اخیر شما اینجا نمایش داده می‌شود.');
    var suggestions=document.getElementById('studySuggestions');suggestions.replaceChildren();var review=Object.keys(api.topics()).filter(function(id){return tags(b,id).includes('نیاز به مرور')||((b.itemState||{})[id]||{}).status==='ضعیف';}).slice(0,5);review.forEach(function(id){link(suggestions,id,'برای مرور بعدی');});if(!review.length)empty(suggestions,'برای پیشنهاد مرور، مباحث را «ضعیف» یا «نیاز به مرور» علامت بزنید.');
    var filter=document.getElementById('studyTagFilter').value,tagged=document.getElementById('studyTagged');tagged.replaceChildren();Object.keys(api.topics()).filter(function(id){var t=tags(b,id);return t.length&&(filter==='همه'||t.includes(filter));}).forEach(function(id){link(tagged,id,tags(b,id).join(' · '));});if(!tagged.children.length)empty(tagged,'برچسب‌ها را در داخل هر مبحث انتخاب کنید.');
    document.querySelectorAll('[data-tag-topic]').forEach(function(root){root.querySelectorAll('[data-study-tag]').forEach(function(button){var selected=tags(b,root.dataset.tagTopic).includes(button.dataset.studyTag);button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.disabled=!api.ready();});});
    var quizRoot=document.getElementById('studyQuizSummary');if(quizRoot)quizRoot.textContent=all.quiz.total?number(all.quiz.correct/all.quiz.total*100)+'٪ پاسخ درست · '+number(all.quiz.total)+' سؤال پاسخ‌داده‌شده':'هنوز پاسخ تستی ثبت نشده است.';
    var quizChart=document.getElementById('studyQuizChart');if(quizChart)bars(quizChart,all.quiz.total?[{label:'اولین پاسخ درست',value:all.quiz.correct},{label:'نیازمند تمرین',value:all.quiz.total-all.quiz.correct}]:[],'سؤال');
    renderAnnotations();renderAdmin();
  }
  function renderAdmin(){
    var root=document.getElementById('adminOverview');if(!root||bucket().backendRole!=='admin')return;root.replaceChildren();var users=api.state().users||{},ids=Object.keys(users),range=document.getElementById('analyticsRange').value,metricKey=document.getElementById('analyticsMetric').value;
    metric(root,'کل کاربران',number(ids.length),'حساب‌های موجود');metric(root,'منتظر تأیید',number(ids.filter(function(id){return users[id].backendApproved===false&&!users[id].backendRejected;}).length),'درخواست‌های جدید');metric(root,'فعال در هفت روز',number(ids.filter(function(id){return aggregate(users[id],7).opens>0;}).length),'با بازشدن محتوا');metric(root,'دسترسی معلق',number(ids.filter(function(id){return users[id].backendRejected;}).length),'اطلاعاتشان حفظ می‌شود');
    var totals={},daily={},statuses={'ضعیف':0,'متوسط':0,'خوب':0,'نامشخص':0};
    ids.forEach(function(uid){var a=aggregate(users[uid],range),weekA=aggregate(users[uid],7);Object.keys(a.topics).forEach(function(id){var entry=totals[id]||(totals[id]={opens:0,seconds:0,readers:0,completed:0});entry.opens+=a.topics[id].opens;entry.seconds+=a.topics[id].seconds;if(a.topics[id].opens)entry.readers++;});Object.keys(api.topics()).forEach(function(id){
      var tag=(users[uid].itemState||{})['tag:'+id]||{},completedDay=tag.completedAt?day(Date.parse(tag.completedAt)):null,age=completedDay?(Date.parse(day()+'T12:00:00Z')-Date.parse(completedDay+'T12:00:00Z'))/86400000:Infinity;
      if(tags(users[uid],id).includes('مطالعه‌شده')&&(range==='all'||age>=0&&age<Number(range))){var entry=totals[id]||(totals[id]={opens:0,seconds:0,readers:0,completed:0});entry.completed++;}
    });Object.keys(weekA.days).forEach(function(d){var item=daily[d]||(daily[d]={seconds:0,opens:0});item.seconds+=weekA.days[d].seconds;item.opens+=weekA.days[d].opens;});Object.keys(statuses).forEach(function(s){statuses[s]+=a.status[s]||0;});
      var personal=document.querySelector('[data-user-analytics="'+uid+'"]');if(personal){var summary=aggregate(users[uid],'all');personal.textContent=number(Object.keys(summary.topics).length)+' مبحث بازشده · '+duration(summary.seconds)+' فعال · '+number(summary.completed)+' مطالعه‌شده · '+number(summary.highlights)+' هایلایت · '+number(summary.quiz.correct)+' از '+number(summary.quiz.total)+' پاسخ درست نخستین';}
    });
    lastExport=Object.keys(totals).map(function(id){return {id:id,label:api.topics()[id].label,...totals[id]};}).sort(function(a,b){return b[metricKey]-a[metricKey];});
    bars(document.getElementById('adminReadChart'),lastExport.filter(function(row){return row[metricKey]>0;}).slice(0,12).map(function(row){return {...row,value:row[metricKey]};}),metricKey==='seconds'?'seconds':metricKey==='readers'||metricKey==='completed'?'کاربر':'بار');
    bars(document.getElementById('adminStatusChart'),Object.keys(statuses).map(function(status){return {label:status,value:statuses[status]};}),'مبحث');week(document.getElementById('adminWeekChart'),daily);
  }
  function visible(id){
    var topic=api.topics()[id],education=document.getElementById('tabPanelEducation');
    return !!(topic&&education&&education.classList.contains('active')&&topic.itemEl.classList.contains('open')&&topic.learnPanel.classList.contains('open')&&topic.itemEl.closest('.topic-cat').classList.contains('open'));
  }
  function open(id,type){
    stop();if(!api||!api.ready()||!api.topics()[id]||!visible(id))return;current={id:id,type:type};lastTick=Date.now();lastInteraction=Date.now();
    var key='activity:'+id+':'+day(),data=Object.assign({opens:0,seconds:0,types:{}},bucket().itemState[key]||{}),throttle=id+':'+type;
    if(!lastOpens[throttle]||Date.now()-lastOpens[throttle]>30000){data.opens++;data.types=Object.assign({},data.types);data.types[type]=(data.types[type]||0)+1;data.lastOpenedAt=new Date().toISOString();api.save(key,data);lastOpens[throttle]=Date.now();render();}
  }
  function tick(final){
    var now=Date.now(),elapsed=(now-lastTick)/1000;lastTick=now;if(!current||!api||!api.ready()||elapsed<=0||elapsed>35||now-lastInteraction>120000)return;
    var topic=api.topics()[current.id];if(!topic||!visible(current.id)||topic.openType!==current.type||(!final&&(document.visibilityState!=='visible'||!document.hasFocus())))return;
    var key='activity:'+current.id+':'+day(),data=Object.assign({opens:0,seconds:0,types:{}},bucket().itemState[key]||{});data.seconds=(Number(data.seconds)||0)+Math.round(elapsed);data.lastOpenedAt=new Date().toISOString();api.save(key,data);render();
  }
  function stop(){if(current)tick(false);current=null;}
  function toggleTag(id,tag){if(!api||!api.ready()||!TAGS.includes(tag)||!api.topics()[id])return;var values=tags(bucket(),id);values=values.includes(tag)?values.filter(function(t){return t!==tag;}):values.concat(tag);var old=bucket().itemState['tag:'+id]||{},now=new Date().toISOString();api.save('tag:'+id,{tags:values,updatedAt:now,completedAt:values.includes('مطالعه‌شده')?(old.completedAt||now):null});render();}
  function notification(action,chatId){
    var status=document.getElementById('notificationStatus');status.textContent='در حال بررسی…';
    var buttons=document.querySelectorAll('[data-notification-action]');buttons.forEach(function(b){b.disabled=true;});
    return global.IntMedBackend.notificationAction(action,chatId).then(function(value){
      if(action==='status')status.textContent=!value.tokenConfigured?'توکن بات هنوز در تنظیمات محرمانهٔ سرور ثبت نشده است.':!value.connected?'بات آماده است؛ در تلگرام Start را بزنید، سپس گفت‌وگوی خودتان را پیدا و انتخاب کنید.':'تلگرام متصل است؛ '+number(value.pending)+' اعلان در صف ارسال است.';
      if(action==='discover'){
        var chats=document.getElementById('notificationChats');chats.replaceChildren();
        (value.chats||[]).forEach(function(chat){var button=document.createElement('button');button.type='button';button.className='secondary-action';button.textContent='اتصال به '+chat.name;button.addEventListener('click',function(){notification('connect',chat.id);});chats.appendChild(button);});
        status.textContent=value.chats&&value.chats.length?'گفت‌وگوی متعلق به خودتان را انتخاب کنید.':'گفت‌وگویی پیدا نشد؛ در تلگرام بات خودتان را باز کنید و Start را بزنید.';
      }
      if(action==='connect'){document.getElementById('notificationChats').replaceChildren();status.textContent='گفت‌وگوی شما متصل شد. اکنون اعلان آزمایشی را امتحان کنید.';}
      if(action==='test')status.textContent='اعلان آزمایشی به تلگرام ارسال شد.';
      if(action==='retry')status.textContent=number(value.sent)+' اعلان ارسال شد.';
    }).catch(function(e){status.textContent=e.status===404?'اعلان تلگرام هنوز در سرور نصب نشده است؛ مراحل راه‌اندازی اولیه باقی مانده‌اند.':e.message||'ارتباط برقرار نشد؛ دوباره تلاش کنید.';}).finally(function(){buttons.forEach(function(b){b.disabled=false;});});
  }
  function answer(id,question,correct){
    if(!api||!api.ready()||!api.topics()[id])return;var key='quiz:'+id+':'+question;
    if(bucket().itemState[key])return;
    api.save(key,{firstCorrect:correct===true,answeredAt:new Date().toISOString()});render();
  }
  function init(options){api=options;document.getElementById('annotationSearch').addEventListener('input',renderAnnotations);document.querySelectorAll('[data-notification-action]').forEach(function(button){button.addEventListener('click',function(){notification(button.dataset.notificationAction);});});['studyTagFilter','analyticsRange','analyticsMetric'].forEach(function(id){var element=document.getElementById(id);if(element)element.addEventListener('change',render);});['pointerdown','keydown','scroll','touchstart'].forEach(function(name){document.addEventListener(name,function(){lastInteraction=Date.now();},{passive:true});});setInterval(function(){tick(false);},30000);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'){tick(true);api.flush();}else{lastTick=Date.now();lastInteraction=Date.now();}});window.addEventListener('pagehide',function(){tick(true);api.flush();});var exportButton=document.getElementById('adminExportStats');if(exportButton)exportButton.addEventListener('click',function(){if(bucket().backendRole!=='admin')return;var rows=[['مبحث','بازشدن محتوا','ثانیه فعال','کاربران یکتا','علامت مطالعه‌شده']].concat(lastExport.map(function(r){return [r.label,r.opens,r.seconds,r.readers,r.completed];}));var csv='\uFEFF'+rows.map(function(row){return row.map(function(cell){return '"'+String(cell).replace(/^([=+@-])/,"'$1").replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');var url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='intmed-topic-statistics.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);});}
  global.IntMedDashboard={init:init,render:render,open:open,stop:stop,toggleTag:toggleTag,aggregate:aggregate,answer:answer};
})(window);
