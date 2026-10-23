(function(){
 'use strict';
 var reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new WeakMap();
 function animateBody(body,opening,finish){
  var old=animations.get(body);if(old)old.cancel();body.style.removeProperty('height');body.style.display='block';body.style.maxHeight='none';
  if(reduced.matches||!body.animate){if(finish)finish();clean();return;}
  var height=body.scrollHeight;body.style.overflow='hidden';body.inert=!opening;
  var animation=body.animate([{height:(opening?0:height)+'px',opacity:opening?0:1,transform:opening?'translateY(-4px)':'none'},{height:(opening?height:0)+'px',opacity:opening?1:0,transform:opening?'none':'translateY(-4px)'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'});animations.set(body,animation);
  animation.onfinish=function(){if(animations.get(body)!==animation)return;if(finish)finish();clean();animations.delete(body);};
  function clean(){body.style.removeProperty('display');body.style.removeProperty('height');body.style.removeProperty('max-height');body.style.removeProperty('overflow');body.style.removeProperty('transform');body.inert=false;}
 }
 document.addEventListener('click',function(event){document.querySelectorAll('.topic-tags[open]').forEach(function(el){if(!el.contains(event.target))el.open=false;});},true);
 document.addEventListener('click',function(event){
  var summary=event.target.closest('summary');if(!summary||summary.parentElement.tagName!=='DETAILS'||event.target.closest('a,button,input,select'))return;
  var details=summary.parentElement;if(details.classList.contains('topic-tags'))return;
  event.preventDefault();var body=details.querySelector(':scope > .disclosure-body');if(!body){body=document.createElement('div');body.className='disclosure-body';Array.from(details.childNodes).forEach(function(child){if(child!==summary)body.appendChild(child);});details.appendChild(body);}
  var opening=!details.open;if(opening)details.open=true;animateBody(body,opening,function(){if(!opening)details.open=false;});
 });
 document.addEventListener('keydown',function(event){if(event.key==='Escape')document.querySelectorAll('.topic-tags[open]').forEach(function(el){el.open=false;el.querySelector('summary').focus();});});
 var map={ 'topic-item':'.topic-detail','topic-cat':'.cat-body','phase':'.phase-body','vent-card':'.vent-body' };
 new MutationObserver(function(records){var roots=new Map();records.forEach(function(record){var el=record.target;if(!(el instanceof HTMLElement))return;var old=(record.oldValue||'').split(/\s+/),opening=el.classList.contains('open');if(old.includes('open')===opening)return;if(el.classList.contains('learn-panel')){roots.set(el,{body:el,opening:opening});return;}Object.keys(map).some(function(name){if(!el.classList.contains(name))return false;var body=el.querySelector(map[name]);if(body)roots.set(el,{body:body,opening:opening});return true;});});roots.forEach(function(value){animateBody(value.body,value.opening);});}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
})();
