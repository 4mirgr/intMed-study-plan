(function(){
  var topHeader = document.querySelector("header.top");
  var collapseBtn = document.getElementById("headerCollapseBtn");
  if(!topHeader || !collapseBtn) return;
  function measureHeader(){document.documentElement.style.setProperty("--intmed-header-height",(topHeader.getBoundingClientRect().height+24)+"px");}
  if(window.ResizeObserver)new ResizeObserver(measureHeader).observe(topHeader);
  else window.addEventListener("resize",measureHeader);
  measureHeader();
  if(window.matchMedia && window.matchMedia("(max-width: 600px)").matches){
    topHeader.classList.add("collapsed");
    collapseBtn.setAttribute("aria-expanded", "false");
    collapseBtn.setAttribute("aria-label", "بازکردن نوار بالا");
    collapseBtn.title = "بازکردن نوار بالا";
    var initialRegion=document.getElementById("headerCollapsible");
    if(initialRegion) initialRegion.inert=true;
  }
  collapseBtn.addEventListener("click", function(){
    var collapsed = topHeader.classList.toggle("collapsed");
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    collapseBtn.setAttribute("aria-label", collapsed ? "بازکردن نوار بالا" : "جمع‌کردن نوار بالا");
    collapseBtn.title = collapsed ? "بازکردن نوار بالا" : "جمع‌کردن نوار بالا";
    var region=document.getElementById("headerCollapsible");
    if(region) region.inert=collapsed;
  });

  // Each entry: fnv1aHex(lowercased-username + ":" + normalized-password) -> a stable
  // userId used to namespace that person's phase-checklist/notes/highlights in the
  // shared GitHub state.json (see STATE.users below). Adding a third person later is
  // just one more {hash, id} entry here.
  // Production authentication is handled by the private backend. Weak static hashes were
  // removed from the public source. Legacy demo mode is opt-in and has no built-in users.
  var GATE_USERS = [];
  function legacyDemoAllowed(){
    var c = window.INTMED_CONFIG || {};
    return !!c.allowLegacyDemo && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  }
  var gateEl = document.getElementById("loginGate");
  var appEl = document.getElementById("appRoot");
  var accountProviderNotice = document.getElementById("accountProviderNotice");
  var accountProviderNoticeClose = document.getElementById("accountProviderNoticeClose");
  function showAccountProviderNotice(){
    var shouldShow = false;
    try{
      shouldShow = sessionStorage.getItem("intmed_show_account_provider_notice") === "1";
      sessionStorage.removeItem("intmed_show_account_provider_notice");
    }catch(e){}
    if(!shouldShow || !accountProviderNotice) return;
    accountProviderNotice.style.display = "flex";
    if(accountProviderNoticeClose) accountProviderNoticeClose.focus();
  }
  function closeAccountProviderNotice(){
    if(accountProviderNotice) accountProviderNotice.style.display = "none";
  }
  if(accountProviderNoticeClose) accountProviderNoticeClose.addEventListener("click", closeAccountProviderNotice);
  if(accountProviderNotice) accountProviderNotice.addEventListener("keydown", function(ev){
    if(ev.key === "Escape") closeAccountProviderNotice();
  });
  function revealApp(){
    gateEl.style.display = "none";
    appEl.style.display = "";
    showAccountProviderNotice();
  }
  function sessionStore(){return window.IntMedBackend&&window.IntMedBackend.isSessionPersistent&&window.IntMedBackend.isSessionPersistent()?localStorage:sessionStorage;}
  function markSessionActivity(force){
    try{var store=sessionStore(),now=Date.now(),last=Number(store.getItem('intmed_last_activity')||0);if(force||now-last>30000)store.setItem('intmed_last_activity',String(now));}catch(e){}
  }
  function clearUiSession(){
    try{['bp_authed','bp_user_id','intmed_session_started','intmed_last_activity'].forEach(function(key){localStorage.removeItem(key);sessionStorage.removeItem(key);});}catch(e){}
  }
  function enforceSessionAge(){
    try{var store=sessionStore(),started=Number(store.getItem('intmed_session_started')||Date.now()),active=Number(store.getItem('intmed_last_activity')||started),now=Date.now();if(now-started>12*60*60*1000||now-active>2*60*60*1000){clearUiSession();window.IntMedBackend.signOut().finally(function(){location.reload();});}}catch(e){}
  }
  ['pointerdown','keydown','touchstart'].forEach(function(name){document.addEventListener(name,function(){markSessionActivity(false);},{passive:true});});
  setInterval(enforceSessionAge,60000);
  function fnv1aHex(str){
    // Plain synchronous JS hash — deliberately not crypto.subtle, which needs
    // a secure context (https) and is unavailable in some mobile in-app
    // webviews. Deterrence only (per user decision), so this is sufficient.
    var h = 0x811c9dc5;
    for(var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  function normalizeDigits(s){
    // Persian/Arabic-Indic digits + stray direction-mark chars some mobile
    // keyboards insert are common when typing a phone-number password.
    return String(s)
      .replace(/[‌‎‏‪-‮]/g, "")
      .replace(/[۰-۹]/g, function(d){ return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)); })
      .replace(/[٠-٩]/g, function(d){ return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); })
      .trim();
  }
  // Email links may return to an already-open tab via a hash-only navigation.
  window.addEventListener("hashchange",function(){
    var values=new URLSearchParams(location.hash.slice(1));
    if((values.get("type")==="recovery" || values.get("type")==="invite") && values.get("access_token")) location.reload();
  });
  var recovering = !!(window.IntMedBackend && window.IntMedBackend.isConfigured() && window.IntMedBackend.captureRecoverySession());
  try{
    var backendSession = window.IntMedBackend && window.IntMedBackend.isConfigured() && window.IntMedBackend.session();
    if(!recovering && backendSession && backendSession.user){
      window.IntMedBackend.profile().then(function(profile){
        if(!profile || !profile.approved || profile.rejected) throw new Error("حساب فعال نیست.");
        var store=sessionStore();store.setItem("bp_authed", "1");store.setItem("bp_user_id", backendSession.user.id);if(!store.getItem('intmed_session_started'))store.setItem('intmed_session_started',String(Date.now()));markSessionActivity(true);
        revealApp();
      }).catch(function(){
        appEl.style.display="none"; gateEl.style.display="";
        var error=document.getElementById("loginErr");error.textContent="ورود حساب تأیید نشد؛ تأیید ایمیل، وضعیت حساب و اتصال را بررسی کنید.";error.classList.add("show");
      });
    } else if(legacyDemoAllowed() && localStorage.getItem("bp_authed") === "1"){
      // Backfill for sessions authenticated before multi-user support existed.
      if(!localStorage.getItem("bp_user_id")){ localStorage.setItem("bp_user_id", "amir"); }
      revealApp();
    }
  }catch(e){}
  var loginForm = document.getElementById("loginForm");
  var loginErr = document.getElementById("loginErr");
  var recoveryForm = document.getElementById("recoveryForm");
  if(window.IntMedBackend && window.IntMedBackend.isConfigured()){
    document.getElementById("loginUser").placeholder = "نام کاربری";
    document.getElementById("forgotUser").placeholder = "ایمیل یا نام کاربری";
    var forgotHelp = document.querySelector("#forgotForm p");
    if(forgotHelp) forgotHelp.textContent = "ایمیل یا نام کاربری را وارد کنید؛ لینک تغییر رمز فقط به ایمیل تأییدشدهٔ حساب ارسال می‌شود.";
    var successText = document.querySelector("#signupSuccessBox .signup-success-text");
    if(successText) successText.innerHTML = "<b>ثبت‌نام شما دریافت شد.</b> پس از تأیید ایمیل می‌توانید بلافاصله با نام کاربری و رمز خود وارد شوید.";
    var successActions = document.querySelector("#signupSuccessBox .signup-success-actions");
    if(successActions) successActions.style.display = "none";
    if(recovering){
      loginForm.style.display = "none";
      recoveryForm.style.display = "";
    }
  }
  recoveryForm.addEventListener("submit", function(ev){
    ev.preventDefault();
    var password = document.getElementById("recoveryPass").value;
    var confirmPassword = document.getElementById("recoveryPassConfirm").value;
    var errorBox = document.getElementById("recoveryErr");
    if(password.length < 8){ errorBox.textContent = "رمز باید حداقل ۸ نویسه باشد."; errorBox.classList.add("show"); return; }
    if(password !== confirmPassword){ errorBox.textContent = "دو رمز یکسان نیستند."; errorBox.classList.add("show"); return; }
    var button = recoveryForm.querySelector("button[type=submit]");
    button.disabled = true; button.textContent = "در حال ذخیره...";
    window.IntMedBackend.updatePassword(password).then(function(){
      return window.IntMedBackend.signOut();
    }).then(function(){
      alert("رمز جدید ذخیره شد. اکنون وارد شوید.");
      location.reload();
    }).catch(function(error){
      button.disabled = false; button.textContent = "ذخیرهٔ رمز جدید";
      errorBox.textContent = error.message || "ذخیرهٔ رمز ناموفق بود؛ لینک بازیابی را دوباره درخواست کنید.";
      errorBox.classList.add("show");
    });
  });
  function doLogin(userId){
    try{
      var store=sessionStore();store.setItem("bp_authed", "1");store.setItem("bp_user_id", userId);store.setItem('intmed_session_started',String(Date.now()));store.setItem('intmed_last_activity',String(Date.now()));
      sessionStorage.setItem("intmed_show_account_provider_notice", "1");
    }catch(e){}
    // Full reload (not just revealApp()) because the main app script below
    // already ran and fixed CURRENT_USER_ID from localStorage as it was
    // *before* this login — without a reload, a fresh login would keep
    // operating under the fallback user id for the rest of this tab.
    location.reload();
  }

  // Unauthenticated read of state.json — works because the repo is public,
  // used here only to check approved signups at login time (no PAT needed
  // for a GET on a public repo, only for writes).
  function fetchPublicState(){
    var url = "https://api.github.com/repos/4mirgr/intMed-study-plan/contents/state.json?ref=study-state";
    return fetch(url, { headers: { "Accept": "application/vnd.github.raw+json" } }).then(function(r){
      if(!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  document.getElementById('checkLoginConnection').addEventListener('click',function(){
    var button=this,status=document.getElementById('loginConnectionStatus');button.disabled=true;status.textContent='در حال بررسی اتصال امن…';
    window.IntMedBackend.checkAuthConnection().then(function(){status.textContent='ارتباط با سرویس حساب برقرار است. دوباره ورود را امتحان کنید؛ اگر خطا باقی ماند، متن دقیق خطای جدید را ارسال کنید.';}).catch(function(e){status.textContent=e.status?'سرور حساب پاسخ داد، اما خطای '+e.status+' دارد. این کد را به مدیریت گزارش کنید.':'هیچ‌کدام از دو مسیر امن ورود پاسخ ندادند. این مشکل از مسیر شبکه یا سرویس حساب است؛ کمی بعد دوباره بررسی کنید.';}).finally(function(){button.disabled=false;});
  });
  loginForm.addEventListener("submit", function(ev){
    ev.preventDefault();
    var u = normalizeDigits(document.getElementById("loginUser").value).toLowerCase();
    var p = window.IntMedBackend && window.IntMedBackend.isConfigured() ? document.getElementById("loginPass").value : normalizeDigits(document.getElementById("loginPass").value);
    if(window.IntMedBackend && window.IntMedBackend.isConfigured()){
      loginErr.classList.remove("show");
      var secureLoginBtn = loginForm.querySelector("button[type=submit]");
      secureLoginBtn.disabled = true; secureLoginBtn.textContent = "در حال بررسی...";
      window.IntMedBackend.setSessionPersistence(!!document.getElementById('trustedDevice').checked);
      window.IntMedBackend.signIn(u, p).then(function(result){
        doLogin(result.session.user.id);
      }).catch(function(error){
        secureLoginBtn.disabled = false; secureLoginBtn.textContent = "ورود";
        loginErr.textContent = error.message || "نام کاربری یا رمز عبور اشتباه است.";
        loginErr.classList.add("show");
      });
      return;
    }
    if(!legacyDemoAllowed()){
      loginErr.textContent = "سامانهٔ حساب امن هنوز پیکربندی نشده است؛ مدیر باید اتصال Supabase را کامل کند.";
      loginErr.classList.add("show");
      return;
    }
    var h = fnv1aHex(u + ":" + p);
    var matched = null;
    for(var i=0;i<GATE_USERS.length;i++){ if(GATE_USERS[i].hash === h){ matched = GATE_USERS[i]; break; } }
    if(matched){
      loginErr.classList.remove("show");
      doLogin(matched.id);
      return;
    }
    // Not one of the static accounts — check approved signups (STATE.signups,
    // written by the admin from the admin panel; see the main app IIFE).
    loginErr.classList.remove("show");
    var loginBtn = loginForm.querySelector("button[type=submit]");
    if(loginBtn){ loginBtn.disabled = true; loginBtn.textContent = "در حال بررسی..."; }
    fetchPublicState().then(function(remote){
      // Preferred: the live passwordHash on the user's own bucket — this is
      // what a password change from the admin panel updates, so a changed
      // password takes effect immediately. Falls back to the original
      // approved-signup hash for an approved user who's never had their
      // password changed since (that field didn't exist before this).
      var foundUserId = null;
      var users = (remote && remote.users) || {};
      for(var uid in users){
        if(users.hasOwnProperty(uid) && users[uid].passwordHash === h){ foundUserId = uid; break; }
      }
      if(!foundUserId){
        var signups = (remote && remote.signups) || [];
        for(var j=0;j<signups.length;j++){
          if(signups[j].hash === h && signups[j].status === "approved" && signups[j].userId){ foundUserId = signups[j].userId; break; }
        }
      }
      if(loginBtn){ loginBtn.disabled = false; loginBtn.textContent = "ورود"; }
      if(foundUserId){ doLogin(foundUserId); return; }
      loginErr.textContent = "نام کاربری یا رمز عبور اشتباه است.";
      loginErr.classList.add("show");
    }).catch(function(){
      if(loginBtn){ loginBtn.disabled = false; loginBtn.textContent = "ورود"; }
      loginErr.textContent = "نام کاربری یا رمز عبور اشتباه است.";
      loginErr.classList.add("show");
    });
  });

  // ---------------------------------------------------------------
  // عضویت (signup): collects profile fields + a username/password the
  // person chooses themselves, computed into the same fnv1aHex login hash
  // used everywhere else (plaintext password never stored anywhere). This
  // does NOT write anywhere by itself — there is no secure way for an
  // anonymous visitor to write into the public state.json (any token
  // capable of that write would be sitting in this public page's source
  // for anyone to take, which is exactly the problem flagged and refused
  // earlier for a shared sync token). So submitting here only shows the
  // success panel and hands the person a way to relay their own info to
  // the admin (WhatsApp / copy); the admin enters it into the admin panel
  // themselves (an authenticated write, with their own already-connected
  // PAT) to actually create the pending signup record. See CLAUDE.md.
  // ---------------------------------------------------------------
  var signupForm = document.getElementById("signupForm");
  var signupErr = document.getElementById("signupErr");
  var signupSuccessBox = document.getElementById("signupSuccessBox");
  var signupRecoveryGuide = document.getElementById("signupRecoveryGuide");
  var lastSignupInfo = null;

  var forgotForm = document.getElementById("forgotForm");
  document.getElementById("showSignupLink").addEventListener("click", function(ev){
    ev.preventDefault();
    loginForm.style.display = "none";
    signupForm.style.display = "";
    signupRecoveryGuide.hidden = true;
    signupSuccessBox.style.display = "none";
    forgotForm.style.display = "none";
  });
  document.getElementById("showLoginLink").addEventListener("click", function(ev){
    ev.preventDefault();
    signupForm.style.display = "none";
    loginForm.style.display = "";
  });
  document.getElementById("backToLoginFromSuccess").addEventListener("click", function(ev){
    ev.preventDefault();
    signupSuccessBox.style.display = "none";
    loginForm.style.display = "";
  });
  document.getElementById("showForgotLink").addEventListener("click", function(ev){
    ev.preventDefault();
    loginForm.style.display = "none";
    forgotForm.style.display = "";
  });
  document.getElementById("showLoginFromForgot").addEventListener("click", function(ev){
    ev.preventDefault();
    forgotForm.style.display = "none";
    loginForm.style.display = "";
  });
  document.getElementById("signupRecoveryLink").addEventListener("click", function(){
    var email=document.getElementById("signupEmail").value.trim();
    signupForm.style.display="none";
    forgotForm.style.display="";
    document.getElementById("forgotUser").value=email;
    document.getElementById("forgotUser").focus();
  });
  forgotForm.addEventListener("submit", function(ev){
    ev.preventDefault();
    var email=document.getElementById("forgotUser").value.trim();
    var button=document.getElementById("forgotSendEmail"),status=document.getElementById("forgotStatus");
    status.textContent="";status.classList.remove("error");
    if(!window.IntMedBackend || !window.IntMedBackend.isConfigured()){
      status.textContent="بازیابی ایمیلی هنوز پیکربندی نشده است.";status.classList.add("error");return;
    }
    button.disabled=true;button.textContent="در حال ارسال…";
    window.IntMedBackend.resetPassword(email).then(function(){
      status.textContent="اگر حسابی با این مشخصات ثبت شده باشد، لینک بازیابی به ایمیل آن ارسال می‌شود. پوشهٔ هرزنامه را هم بررسی کنید.";
    }).catch(function(error){
      status.textContent=error.status===404 ? "بازیابی با نام کاربری هنوز در سرور نصب نشده؛ فعلاً ایمیل خود را وارد کنید." : error.status===429 ? "تعداد درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره تلاش کنید." : "ارسال درخواست ناموفق بود؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.";
      status.classList.add("error");
    }).finally(function(){button.disabled=false;button.textContent="ارسال لینک بازیابی رمز";});
  });

  signupForm.addEventListener("submit", function(ev){
    ev.preventDefault();
    var username = normalizeDigits(document.getElementById("signupUser").value).toLowerCase().trim();
    var password = window.IntMedBackend && window.IntMedBackend.isConfigured() ? document.getElementById("signupPass").value : normalizeDigits(document.getElementById("signupPass").value);
    var confirmPassword = window.IntMedBackend && window.IntMedBackend.isConfigured() ? document.getElementById("signupPassConfirm").value : normalizeDigits(document.getElementById("signupPassConfirm").value);
    var fullName = document.getElementById("signupFullName").value.trim();
    var degree = document.getElementById("signupDegree").value.trim();
    var specialty = document.getElementById("signupSpecialty").value.trim();
    var province = document.getElementById("signupProvince").value.trim();
    var idNumber = document.getElementById("signupIdNumber").value.trim();
    var mobile = normalizeDigits(document.getElementById("signupMobile").value).trim();
    var email = document.getElementById("signupEmail").value.trim();
    signupRecoveryGuide.hidden = true;
    if(!username || !password || !confirmPassword || !fullName || !degree){
      signupErr.classList.add("show");
      return;
    }
    signupErr.classList.remove("show");
    if(!/^[a-z0-9_.-]{3,64}$/.test(username) || password.length < 8){
      signupErr.textContent = "نام کاربری باید ۳ تا ۶۴ حرف انگلیسی یا عدد و رمز حداقل ۸ نویسه باشد.";
      signupErr.classList.add("show"); return;
    }
    if(password !== confirmPassword){
      signupErr.textContent = "رمز عبور و تکرار آن یکسان نیستند.";
      signupErr.classList.add("show"); return;
    }
    if(!window.IntMedRegistration.valid(degree, specialty, province)){
      signupErr.textContent = "مدرک، رشته و استان را از گزینه‌های فهرست انتخاب کنید.";
      signupErr.classList.add("show"); return;
    }
    if(window.IntMedBackend && window.IntMedBackend.isConfigured()){
      if(!email){ signupErr.textContent = "برای حساب امن، ایمیل الزامی است."; signupErr.classList.add("show"); return; }
      var signupButton = signupForm.querySelector("button[type=submit]");
      signupButton.disabled = true;
      window.IntMedBackend.signUp(email, password, {
        app:"intmed", username:username, fullName:fullName, degree:degree, specialty:specialty, province:province, idNumber:idNumber, phone:mobile
      }).then(function(){
        lastSignupInfo = {username:username, fullName:fullName, degree:degree, idNumber:idNumber, mobile:mobile, email:email};
        signupForm.style.display = "none";
        signupSuccessBox.style.display = "";
      }).catch(function(error){
        if(error.code === "duplicate_email"){
          signupErr.textContent = "این ایمیل قبلاً ثبت شده است.";
          signupRecoveryGuide.hidden = false;
        } else signupErr.textContent = error.message || "ثبت‌نام ناموفق بود.";
        signupErr.classList.add("show");
      }).finally(function(){ signupButton.disabled = false; });
      return;
    }
    if(!legacyDemoAllowed()){
      signupErr.textContent = "ثبت‌نام پس از اتصال backend امن فعال می‌شود.";
      signupErr.classList.add("show");
      return;
    }
    lastSignupInfo = {
      username: username, hash: fnv1aHex(username + ":" + password), fullName: fullName,
      degree: degree, idNumber: idNumber, mobile: mobile, email: email
    };
    signupForm.style.display = "none";
    signupSuccessBox.style.display = "";
  });

  document.getElementById("signupSendWhatsapp").addEventListener("click", function(){
    if(!lastSignupInfo) return;
    var text = "درخواست عضویت IntMed:\n" +
      "نام کاربری: " + lastSignupInfo.username + "\n" +
      "نام و نام خانوادگی: " + lastSignupInfo.fullName + "\n" +
      "آخرین مدرک تحصیلی: " + (lastSignupInfo.degree || "-") + "\n" +
      "کد نظام/دانشجویی: " + (lastSignupInfo.idNumber || "-") + "\n" +
      "شماره موبایل: " + lastSignupInfo.mobile + "\n" +
      "ایمیل: " + (lastSignupInfo.email || "-") + "\n" +
      "هش رمز عبور: " + lastSignupInfo.hash;
    // Admin's own number (same as the primary account's login password,
    // per the existing "password is a phone number" convention), in
    // international format for a wa.me deep link.
    var adminMobile = (window.INTMED_CONFIG || {}).legacyAdminWhatsapp || "";
    if(adminMobile) window.open("https://wa.me/" + adminMobile + "?text=" + encodeURIComponent(text), "_blank");
  });

  document.getElementById("signupCopyInfo").addEventListener("click", function(){
    if(!lastSignupInfo) return;
    var text = "درخواست عضویت IntMed:\n" +
      "نام کاربری: " + lastSignupInfo.username + "\n" +
      "نام و نام خانوادگی: " + lastSignupInfo.fullName + "\n" +
      "آخرین مدرک تحصیلی: " + (lastSignupInfo.degree || "-") + "\n" +
      "کد نظام/دانشجویی: " + (lastSignupInfo.idNumber || "-") + "\n" +
      "شماره موبایل: " + lastSignupInfo.mobile + "\n" +
      "ایمیل: " + (lastSignupInfo.email || "-") + "\n" +
      "هش رمز عبور: " + lastSignupInfo.hash;
    var btn = document.getElementById("signupCopyInfo");
    try{
      navigator.clipboard.writeText(text).then(function(){
        var old = btn.textContent; btn.textContent = "کپی شد ✓";
        setTimeout(function(){ btn.textContent = old; }, 1800);
      });
    }catch(e){}
  });
})();

