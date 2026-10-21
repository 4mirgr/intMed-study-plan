(function(){
 'use strict';
 var query=new URLSearchParams(location.hash.slice(1)),token=query.get('token')||'',button=document.getElementById('unsubscribeConfirm'),status=document.getElementById('unsubscribeStatus');
 // Token stays in memory, never referrers, browser storage, logs or requests on page load.
 history.replaceState(null,'',location.pathname);
 if(!token||token.length>2048){button.disabled=true;status.textContent='لینک لغو عضویت معتبر نیست؛ لینک انتهای ایمیل را دوباره باز کنید یا از تنظیمات حساب عضویت را لغو کنید.';return;}
 button.addEventListener('click',function(){
  var config=window.INTMED_CONFIG||{};
  if(!config.supabaseUrl||!config.supabaseAnonKey){status.textContent='اتصال آماده نیست؛ از تنظیمات حساب عضویت را لغو کنید.';return;}
  button.disabled=true;status.textContent='در حال ثبت درخواست…';
  fetch(config.supabaseUrl.replace(/\/$/,'')+'/functions/v1/intmed-newsletter',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseAnonKey},body:JSON.stringify({action:'unsubscribe',token:token}),referrerPolicy:'no-referrer'}).then(async function(response){var result=await response.json().catch(function(){return {};});if(!response.ok)throw Error(result.message||'لغو عضویت انجام نشد؛ دوباره تلاش کنید.');status.textContent=result.message||'عضویت لغو شد.';token='';}).catch(function(error){status.textContent=error.message||'ارتباط برقرار نشد؛ دوباره تلاش کنید.';button.disabled=false;});
 });
})();
