(function(){
  'use strict';
  var KEY='bp_theme',modes=['light','dark','night-shift'];
  var labels={light:'روز',dark:'شب','night-shift':'Night Shift'},icons={
    light:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>',
    dark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.4A8.5 8.5 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z"/><path d="m17 4 .5 1.5L19 6l-1.5.5L17 8l-.5-1.5L15 6l1.5-.5Z"/></svg>',
    'night-shift':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18M5 14a7 7 0 0 1 14 0M12 3v3M4.2 7.2l2.1 2.1M19.8 7.2l-2.1 2.1"/></svg>'
  };
  var preference=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
  function stored(){try{return localStorage.getItem(KEY);}catch{return null;}}
  function system(){return preference&&preference.matches?'dark':'light';}
  function apply(value){
    var theme=modes.includes(value)?value:system();document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme==='dark'?'dark':'light';
    var button=document.getElementById('themeToggleBtn'),next=modes[(modes.indexOf(theme)+1)%modes.length];
    if(button){button.innerHTML=icons[theme]+'<span>'+labels[theme]+'</span>';button.dataset.currentTheme=theme;button.title='حالت '+labels[theme]+'؛ تغییر به '+labels[next];button.setAttribute('aria-label',button.title);}
  }
  apply(stored());
  var button=document.getElementById('themeToggleBtn');
  if(button)button.addEventListener('click',function(){var next=modes[(modes.indexOf(document.documentElement.dataset.theme)+1)%modes.length];try{localStorage.setItem(KEY,next);}catch{}apply(next);});
  window.addEventListener('storage',function(event){if(event.key===KEY)apply(event.newValue);});
  if(preference&&preference.addEventListener)preference.addEventListener('change',function(){if(!modes.includes(stored()))apply(null);});
})();
