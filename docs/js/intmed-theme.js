(function(){
  'use strict';
  var KEY='bp_theme',modes=['light','dark','night-shift'];
  var labels={light:'روز',dark:'شب','night-shift':'Night Shift'},icons={light:'☀️',dark:'🌙','night-shift':'🌅'};
  var preference=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
  function stored(){try{return localStorage.getItem(KEY);}catch{return null;}}
  function system(){return preference&&preference.matches?'dark':'light';}
  function apply(value){
    var theme=modes.includes(value)?value:system();document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';
    var button=document.getElementById('themeToggleBtn'),next=modes[(modes.indexOf(theme)+1)%modes.length];
    if(button){button.textContent=icons[theme]+' '+labels[theme];button.dataset.currentTheme=theme;button.title='حالت '+labels[theme]+'؛ تغییر به '+labels[next];button.setAttribute('aria-label',button.title);}
  }
  apply(stored());
  var button=document.getElementById('themeToggleBtn');
  if(button)button.addEventListener('click',function(){var next=modes[(modes.indexOf(document.documentElement.dataset.theme)+1)%modes.length];try{localStorage.setItem(KEY,next);}catch{}apply(next);});
  window.addEventListener('storage',function(event){if(event.key===KEY)apply(event.newValue);});
  if(preference&&preference.addEventListener)preference.addEventListener('change',function(){if(!modes.includes(stored()))apply(null);});
})();
