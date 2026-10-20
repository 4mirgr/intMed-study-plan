
(function(){
  "use strict";

  // Dark/light toggle — applied immediately (before login reveal) so a returning
  // user's stored preference also covers the login card, not just the app.
  var THEME_KEY = "bp_theme";
  function getStoredTheme(){ try{ return localStorage.getItem(THEME_KEY); }catch(e){ return null; } }
  function setStoredTheme(v){ try{ if(v){ localStorage.setItem(THEME_KEY, v); } else { localStorage.removeItem(THEME_KEY); } }catch(e){} }
  function systemPrefersDark(){ return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  function applyTheme(theme){
    if(theme === "dark"){ document.documentElement.setAttribute("data-theme","dark"); }
    else if(theme === "light"){ document.documentElement.setAttribute("data-theme","light"); }
    else { document.documentElement.removeAttribute("data-theme"); }
    var btn = document.getElementById("themeToggleBtn");
    if(btn){
      var isDark = theme === "dark" || (theme == null && systemPrefersDark());
      btn.textContent = isDark ? "☀️" : "🌙";
    }
  }
  applyTheme(getStoredTheme());
  var themeBtn = document.getElementById("themeToggleBtn");
  if(themeBtn){
    themeBtn.addEventListener("click", function(){
      var current = getStoredTheme();
      var isDark = current === "dark" || (current == null && systemPrefersDark());
      var next = isDark ? "light" : "dark";
      setStoredTheme(next);
      applyTheme(next);
    });
  }
})();

// Header collapse toggle — shrinks the top bar down to just logo/title/clock while
// studying, so it stops taking up screen space; transient per-session state (not
// persisted), since it only matters while this tab stays open on a topic.
