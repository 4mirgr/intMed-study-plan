(function(global){
 'use strict';
 var api;
 function bucket(){return api.state().users[api.user()]||{itemState:{}};}
 function state(b){return (b||bucket()).itemState||{};}
 function number(n){return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:1}).format(n||0);}
 function now(){return new Date().toISOString();}
 function attempts(b,topic,type){return Object.keys(state(b)).filter(function(k){return k.indexOf('exam-attempt:')===0;}).map(function(k){var a=state(b)[k];if(!a)return null;return Array.isArray(a.questions)?a:Object.assign({},a,{questions:(state(b)['exam-definition:'+a.definitionId]||{}).questions||[]});}).filter(function(a){return a&&a.id&&Array.isArray(a.questions)&&(!topic||a.topicId===topic)&&(!type||a.type===type);}).sort(function(a,b){return ((a.round||0)-(b.round||0))||(a.startedAt||'').localeCompare(b.startedAt||'')||a.id.localeCompare(b.id);});}
 function current(topic,type,b){var list=attempts(b,topic,type),latest=list[list.length-1];return latest&&!state(b)['exam-close:'+latest.id]?latest:null;}
 function catalogue(type,payload){
  if(type==='mcq')return (payload.mcq||[]).map(function(q,i){return {id:String(q.id||i),label:q.stem,correctIndex:q.correctIndex,options:q.options};});
  var list=[];(payload.kfPmp||[]).forEach(function(k,i){(k.steps||[]).forEach(function(step,j){list.push({id:String(k.id||i)+':'+String(step.id||('step'+j)),label:k.title+' — '+step.prompt});});});return list;
 }
 function start(topic,type,questions){
  if(!api.ready()||!questions.length)return null;
  var active=current(topic,type);if(active)return active;
  var list=attempts(null,topic,type),latest=list[list.length-1],time=new Date(Math.max(Date.now(),latest?Date.parse(latest.startedAt)+1:0)).toISOString();
  var frozen=questions.map(function(q){return {id:q.id,label:q.label,correctIndex:q.correctIndex,options:q.options};}),encoded=JSON.stringify(frozen),definition=Object.keys(state()).filter(function(key){return key.startsWith('exam-definition:');}).map(function(key){return state()[key];}).find(function(d){return d.topicId===topic&&d.type===type&&JSON.stringify(d.questions)===encoded;});
  if(!definition){definition={id:global.crypto.randomUUID(),topicId:topic,type:type,questions:frozen};api.save('exam-definition:'+definition.id,definition);}
  var value={id:global.crypto.randomUUID(),topicId:topic,type:type,round:latest?(latest.round||0)+1:1,startedAt:time,definitionId:definition.id};
  api.save('exam-attempt:'+value.id,value);return Object.assign({},value,{questions:definition.questions});
 }
 function response(attempt,question,b){return attempt&&state(b)['exam-answer:'+attempt.id+':'+question]||null;}
 function draft(attempt,question){return attempt&&state()['exam-draft:'+attempt.id+':'+question]||{};}
 function grade(attempt,question,b){return attempt&&state(b)['exam-grade:'+attempt.id+':'+question]||null;}
 function canAnswer(attempt,question){return api.ready()&&attempt&&!state()['exam-close:'+attempt.id]&&attempt.questions.some(function(q){return q.id===question;});}
 function answer(attempt,question,selectedIndex,correct,written){
  if(!canAnswer(attempt,question)||response(attempt,question))return false;
  var snapshot=attempt.questions.find(function(q){return q.id===question;});
  if(attempt.type==='mcq'&&(!Number.isInteger(selectedIndex)||!snapshot.options||selectedIndex<0||selectedIndex>=snapshot.options.length))return false;
  if(attempt.type==='kfPmp'&&(!written||!written.trim()))return false;
  api.save('exam-answer:'+attempt.id+':'+question,{attemptId:attempt.id,questionId:question,selectedIndex:selectedIndex,correct:attempt.type==='mcq'?selectedIndex===snapshot.correctIndex:null,written:written||'',answeredAt:now(),mode:attempt.type==='mcq'?'automatic':'self-assessed'});
  if(api.flush)api.flush();render();api.dashboard();updateToolbar(attempt);return true;
 }
 function saveDraft(attempt,question,text){if(canAnswer(attempt,question)&&!response(attempt,question))api.save('exam-draft:'+attempt.id+':'+question,{text:text.slice(0,20000),updatedAt:now()});}
 function assess(attempt,question,value){if(!canAnswer(attempt,question)||!response(attempt,question)||grade(attempt,question)||![0,.5,1].includes(value))return false;api.save('exam-grade:'+attempt.id+':'+question,{value:value,gradedAt:now()});if(api.flush)api.flush();render();api.dashboard();updateToolbar(attempt);return true;}
 function summary(attempt,b){
  var result={total:attempt.questions.length,answered:0,correct:0,wrong:0,partial:0,ungraded:0,score:0,graded:0};
  attempt.questions.forEach(function(q){var r=response(attempt,q.id,b);if(!r)return;result.answered++;var value=attempt.type==='mcq'?(r.correct?1:0):(grade(attempt,q.id,b)||{}).value;
   if(value===undefined){result.ungraded++;return;}result.graded++;result.score+=value;if(value===1)result.correct++;else if(value===0)result.wrong++;else result.partial++;
  });result.accuracy=result.graded?result.score/result.graded*100:0;result.completed=result.total>0&&result.graded===result.total;return result;
 }
 function reset(topic,type){
  if(!api.ready()||!global.confirm('نوبت فعلی در سابقه نگه داشته شود و آزمون تازه‌ای شروع کنید؟ یادداشت‌ها و هایلایت‌ها تغییر نمی‌کنند.'))return false;
  var old=current(topic,type);if(old)api.save('exam-close:'+old.id,{endedAt:now()});
  return api.load(topic).then(function(payload){start(topic,type,catalogue(type,payload));if(api.flush)api.flush();api.refresh(topic,type);render();api.dashboard();return true;}).catch(function(){var status=document.getElementById('examReportStatus');if(status)status.textContent='نوبت قبلی حفظ شد؛ بارگذاری آزمون تازه انجام نشد. دوباره مبحث را باز کنید.';return false;});
 }
 function toolbar(panel,attempt,topic,type,questions){
  var root=document.createElement('div');root.className='exam-toolbar';root.dataset.examAttempt=attempt?attempt.id:'';
  var title=document.createElement('strong');title.textContent=type==='mcq'?'آزمون چهارگزینه‌ای · پاسخ‌ها ذخیره می‌شوند':'KF / PMP · پاسخ تشریحی و خودارزیابی';
  var detail=document.createElement('span');detail.className='exam-toolbar-stats';
  var resetButton=document.createElement('button');resetButton.type='button';resetButton.className='exam-reset';resetButton.textContent='شروع دوباره / نوبت جدید';resetButton.disabled=!api.ready();resetButton.addEventListener('click',function(){reset(topic,type);});root.append(title,detail,resetButton);panel.appendChild(root);
  if(!attempt){detail.textContent='ابتدا ارتباط حساب را برقرار کنید.';return;}
  if(questions.some(function(q){return !attempt.questions.some(function(old){return old.id===q.id;});})){var warning=document.createElement('small');warning.textContent='سؤال تازه به محتوا اضافه شده است؛ برای پاسخ به آن نوبت جدید بسازید.';root.appendChild(warning);}
  updateToolbar(attempt);
 }
 function updateToolbar(attempt){var stats=summary(attempt);document.querySelectorAll('[data-exam-attempt="'+attempt.id+'"] .exam-toolbar-stats').forEach(function(root){root.textContent=number(stats.answered)+' از '+number(stats.total)+' پاسخ · '+number(stats.correct)+' درست · '+number(stats.wrong)+' نادرست'+(stats.partial?' · '+number(stats.partial)+' ناقص':'')+(stats.ungraded?' · '+number(stats.ungraded)+' در انتظار خودارزیابی':'');});}
 function element(tag,text,root,className){var el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;if(root)root.appendChild(el);return el;}
 function render(){
  if(!api)return;var root=document.getElementById('examReports');if(!root)return;
  var opened=new Set(Array.from(root.querySelectorAll('details[open]')).map(function(el){return el.dataset.history;})),openAnswers=new Set(Array.from(root.querySelectorAll('[data-attempt-answers][open]')).map(function(el){return el.dataset.attemptAnswers;}));root.replaceChildren();
  var list=attempts(),groups={},totals={correct:0,wrong:0,partial:0,ungraded:0,answered:0,total:0};list.forEach(function(a){if(!api.topics()[a.topicId])return;var key=a.topicId+'|'+a.type;(groups[key]||(groups[key]=[])).push(a);});
  Object.keys(groups).forEach(function(key){var history=groups[key],latest=history[history.length-1],stats=summary(latest);Object.keys(totals).forEach(function(k){totals[k]+=stats[k];});
   var topic=api.topics()[latest.topicId],card=element('article',undefined,root,'exam-report-card');card.dataset.reportTopic=latest.topicId;card.dataset.reportType=latest.type;
   var header=element('div',undefined,card,'section-heading'),go=element('button',topic.label,header,'insight-topic');go.type='button';go.addEventListener('click',function(){api.open(latest.topicId,latest.type);});element('small',latest.type==='mcq'?'چهارگزینه‌ای · تصحیح خودکار':'KF/PMP · خودارزیابی',header);
   var caption=element('p',number(stats.correct)+' درست · '+number(stats.wrong)+' نادرست · '+number(stats.partial)+' ناقص · '+number(stats.ungraded)+' ارزیابی‌نشده',card,'exam-score');
   element('small','پیشرفت پاسخ‌گویی',card);var progress=element('progress',undefined,card,'exam-completion');progress.max=Math.max(stats.total,1);progress.value=stats.answered;progress.setAttribute('aria-label','پیشرفت پاسخ‌گویی '+topic.label);element('small',number(stats.answered)+' از '+number(stats.total)+' پاسخ · دقت پاسخ‌های ارزیابی‌شده '+number(stats.accuracy)+'٪',card);var accuracy=element('progress',undefined,card,'exam-accuracy '+(stats.accuracy<50?'low-score':stats.accuracy<75?'mid-score':'high-score'));accuracy.max=100;accuracy.value=stats.accuracy;accuracy.setAttribute('aria-label','دقت پاسخ‌های ارزیابی‌شده '+topic.label);
   var previous=history.length>1?summary(history[history.length-2]):null;if(previous&&previous.completed&&stats.completed&&JSON.stringify(latest.questions)===JSON.stringify(history[history.length-2].questions)){var change=stats.accuracy-previous.accuracy;element('p',(change>0?'بهبود ':change<0?'کاهش ':'بدون تغییر؛ ')+number(Math.abs(change))+' واحد درصد نسبت به نوبت قبل',card,change<0?'score-down':'score-up');}
   var button=element('button','نوبت جدید با حفظ سابقه',card,'exam-reset');button.type='button';button.addEventListener('click',function(){reset(latest.topicId,latest.type);});
   var details=element('details',undefined,card,'exam-history');details.dataset.history=key;details.open=opened.has(key);element('summary','سابقهٔ '+number(history.length)+' نوبت',details);
   history.slice().reverse().forEach(function(a,index){var s=summary(a),entry=element('div',undefined,details,'exam-history-row');element('strong','نوبت '+number(history.length-index)+' · '+new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(a.startedAt)),entry);element('p',number(s.correct)+' درست، '+number(s.wrong)+' نادرست، '+number(s.partial)+' ناقص؛ '+number(s.answered)+'/'+number(s.total)+' پاسخ؛ دقت '+number(s.accuracy)+'٪'+(s.completed?' · تکمیل‌شده':' · ناتمام'),entry);
    var answers=element('details',undefined,entry,'attempt-answer-list');answers.dataset.attemptAnswers=a.id;element('summary','پاسخ‌های ثبت‌شدهٔ این نوبت',answers);var body=element('div',undefined,answers);function populate(){if(body.children.length)return;var found=0;a.questions.forEach(function(q){var responseValue=response(a,q.id);if(!responseValue)return;found++;var row=element('article',undefined,body,'attempt-answer-row');element('strong',q.label,row);if(a.type==='mcq'){element('p','گزینهٔ انتخاب‌شده: '+((q.options||[])[responseValue.selectedIndex]||'نامشخص'),row);element('p','گزینهٔ درست: '+((q.options||[])[q.correctIndex]||'نامشخص'),row);element('small',responseValue.correct?'درست':'نادرست',row);}else{element('p',responseValue.written||'',row);var value=(grade(a,q.id)||{}).value;element('small',value===1?'خودارزیابی: درست':value===.5?'خودارزیابی: ناقص':value===0?'خودارزیابی: نادرست':'در انتظار خودارزیابی',row);}});if(!found)element('p','هنوز پاسخی در این نوبت ثبت نشده است.',body);}
    answers.addEventListener('toggle',function(){if(answers.open)populate();});if(openAnswers.has(a.id)){answers.open=true;populate();}
   });
  });
  if(!list.length)element('p','پس از آغاز آزمون، پاسخ‌ها و کارنامهٔ هر نوبت در این بخش نمایش داده می‌شوند.',root,'section-caption');
  var legacy=Object.keys(state()).filter(function(key){var match=/^quiz:([^:]+):/.exec(key);if(!match)return false;var first=attempts(null,match[1],'mcq')[0],entry=state()[key];return !first||!entry.answeredAt||entry.answeredAt<first.startedAt;}).length;if(legacy)element('p',number(legacy)+' نتیجهٔ اولیه از نسخهٔ پیشین محفوظ است؛ چون گزینه و نوبت آن‌ها ثبت نشده، در کارنامهٔ جدید بازسازی نمی‌شوند.',root,'section-caption');
  var totalRoot=document.getElementById('examTotals');if(totalRoot)totalRoot.textContent=number(totals.correct)+' درست · '+number(totals.wrong)+' نادرست · '+number(totals.partial)+' ناقص · '+number(totals.ungraded)+' در انتظار ارزیابی';
 }
 function currentSummary(b,type){var groups={},total={answered:0,correct:0,wrong:0,partial:0,ungraded:0,total:0,attemptCount:0};attempts(b).forEach(function(a){if(!type||a.type===type)groups[a.topicId+'|'+a.type]=a;});Object.keys(groups).forEach(function(key){var s=summary(groups[key],b);Object.keys(total).forEach(function(k){if(k!=='attemptCount')total[k]+=s[k];});total.attemptCount++;});return total;}
 function init(options){api=options;}
 global.IntMedExams={init:init,start:start,current:current,catalogue:catalogue,response:response,draft:draft,answer:answer,saveDraft:saveDraft,grade:grade,assess:assess,summary:summary,attempts:attempts,reset:reset,toolbar:toolbar,render:render,canAnswer:canAnswer,currentSummary:currentSummary};
})(window);
