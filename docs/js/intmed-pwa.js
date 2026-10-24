(function(){
  'use strict';
  if(!('serviceWorker' in navigator)||!(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))return;
  var reloading=false;
  function offer(worker){
    if(!worker||document.getElementById('pwaUpdateButton'))return;
    var button=document.createElement('button');button.type='button';button.id='pwaUpdateButton';button.className='pwa-update';button.textContent='نسخهٔ جدید آماده است؛ به‌روزرسانی';
    button.addEventListener('click',function(){button.disabled=true;worker.postMessage({type:'SKIP_WAITING'});});document.body.appendChild(button);
  }
  navigator.serviceWorker.addEventListener('controllerchange',function(){if(!reloading){reloading=true;location.reload();}});
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js',{scope:'./'}).then(function(registration){
    if(registration.waiting)offer(registration.waiting);
    registration.addEventListener('updatefound',function(){var worker=registration.installing;if(!worker)return;worker.addEventListener('statechange',function(){if(worker.state==='installed'&&navigator.serviceWorker.controller)offer(worker);});});
  }).catch(function(){});});
})();
