(function(){
  "use strict";

  function faDigits(n){
    var map=['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    return String(n).replace(/[0-9]/g,function(d){ return map[d]; });
  }

  // ---------------------------------------------------------------
  // Small header clock — Persian (Jalali) date/day + time, via Intl's
  // built-in persian calendar (no hand-rolled Gregorian->Jalali math).
  // Kept deliberately small/muted so it doesn't compete with the brand.
  // ---------------------------------------------------------------
  function updateHeaderClock(){
    var el = document.getElementById("headerClock");
    if(!el) return;
    try{
      var now = new Date();
      var weekday = new Intl.DateTimeFormat("fa-IR", {weekday:"long"}).format(now);
      var dateStr = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {year:"numeric", month:"long", day:"numeric"}).format(now);
      var timeStr = new Intl.DateTimeFormat("fa-IR", {hour:"2-digit", minute:"2-digit"}).format(now);
      el.textContent = weekday + "، " + dateStr + " — ساعت " + timeStr;
    }catch(e){}
  }
  updateHeaderClock();
  setInterval(updateHeaderClock, 30000);

  // ---------------------------------------------------------------
  // Logged-in user — set by the login-gate IIFE above via localStorage.
  // Namespaces this person's own phase-checklist/notes/highlights inside
  // the shared GitHub state.json (see STATE.users below) so two people
  // using this same site never see or overwrite each other's data.
  // ---------------------------------------------------------------
  var USER_NAMES = { amir: "دکتر گرامی", arash: "آرش", alisalehi: "علی صالحی" };
  var CURRENT_USER_ID = (function(){
    if(window.IntMedBackend && window.IntMedBackend.isConfigured()){
      var session=window.IntMedBackend.session();return session && session.user ? session.user.id : "unauthenticated";
    }
    try{ return localStorage.getItem("bp_user_id") || "amir"; }catch(e){ return "amir"; }
  })();
  (function(){
    var el = document.getElementById("userLabel");
    if(el) el.textContent = USER_NAMES[CURRENT_USER_ID] || CURRENT_USER_ID;
  })();
  document.getElementById("logoutBtn").addEventListener("click", function(){
    var finish = function(){
      try{ localStorage.removeItem("bp_authed"); localStorage.removeItem("bp_user_id"); }catch(e){}
      location.reload();
    };
    if(window.IntMedBackend && window.IntMedBackend.isConfigured()) window.IntMedBackend.signOut().then(finish, finish);
    else finish();
  });

  // ---------------------------------------------------------------
  // CONTENT — phases (static; only interactive state lives in db)
  // ---------------------------------------------------------------
  var PHASES = [
    { id:"p0", color:"#5b6472", badge:"فاز ۰", title:"تشخیص دقیق، قبل از شروع مطالعه", when:"هفتهٔ اول",
      goal:"هدف: به‌جای حدس زدن نقطه ضعف، از روی برگهٔ امتحان واقعی تصمیم بگیر. بدون این فاز، بقیهٔ برنامه حدسی می‌مونه.",
      items:[
        {id:"p0-1", text:"مرور کارنامهٔ آزمون ارتقای اخیر و لیست کردن سؤال‌های غلط بر اساس مبحث"},
        {id:"p0-2", text:"برای هر غلط، نوع خطا رو مشخص کن: دانشی / بددقتی در خواندن سؤال / فشار زمان / حدس اشتباه"},
        {id:"p0-3", text:"تاریخ دقیق دورهٔ بعدی آزمون دانشنامهٔ تخصصی داخلی رو از منبع رسمی تأیید کن و ماه‌های واقعی باقی‌مانده رو بشمار"},
        {id:"p0-4", text:"۳ مبحث پراشتباه رو ثبت کن و در بخش «نقشه دانش» پایین صفحه وضعیتشون رو «ضعیف» بزن"}
      ]
    },
    { id:"p1", color:"#1d6fbd", badge:"فاز ۱", title:"ساخت عادت تست‌زنیِ closed-book", when:"ماه ۱ تا ۳",
      goal:"هدف: از همین اول عادت کن بدون تقلب کوچیک بالینی (بدون آپتودیت، بدون چک کردن دوز) جواب بدی — سر جلسهٔ بورد این ابزارها رو نداری.",
      items:[
        {id:"p1-1", text:"برای هر مبحث ضعیف فاز ۰: فقط جدول‌ها و الگوریتم‌های کلیدی هاریسون رو مرور کن — تماشای ویدیوی کامل فقط اگه مبحث واقعاً ناآشناست"},
        {id:"p1-2", text:"هفته‌ای حداقل یک ست ۵۰ سؤالی تایم‌دار از تست‌های ۵ سال اخیر ارتقا/بورد — کاملاً closed-book"},
        {id:"p1-3", text:"بعد از هر ست، تک‌تک گزینه‌های غلط رو تحلیل کن، نه فقط جواب درست"},
        {id:"p1-4", text:"برای هر نکتهٔ دام‌دار، فلش‌کارت active recall بساز به‌جای خلاصه‌نویسی دستی"},
        {id:"p1-5", text:"جدول داروهای خوراکی دیابت رو از حفظ، بدون نگاه کردن، روی کاغذ بازسازی کن — تکرار تا بدون خطا"},
        {id:"p1-6", text:"الگوریتم تاکی‌کاردی QRS باریک/پهن و پروتکل فئوکروموسیتوم رو closed-book روی کاغذ بازسازی کن"}
      ]
    },
    { id:"p2", color:"#7a3fc4", badge:"فاز ۲", title:"افزایش حجم تست + پوشش بقیهٔ دروس", when:"ماه ۴ تا ۷",
      goal:"هدف: یک چک واقعی بگیر که نمره داره بالا میره یا نه. اگه بعد این حجم پیشرفت نبود، فرض «فقط مشکل تکنیکه» رو کنار بذار.",
      items:[
        {id:"p2-1", text:"حجم تست تایم‌دار رو به ۲ تا ۳ ست در هفته برسون"},
        {id:"p2-2", text:"هفته‌ای دو بار شبیه‌سازی کیس KFP/PMP — مرحله‌به‌مرحله: اقدام فوری → تست تشخیصی → درمان قطعی"},
        {id:"p2-3", text:"روماتولوژی، هماتولوژی/آنکولوژی و عفونی رو با همون روش دو-قدمی پوشش بده"},
        {id:"p2-4", text:"نمرهٔ هر ست تایم‌دار رو ثبت کن"},
        {id:"p2-5", text:"بعد از ۴ هفته: روند نمرات رو چک کن — اگه واضح بالا نرفته، این علامت خطره"},
        {id:"p2-6", text:"سناریوی آدرنال اینسیدنتالوما و کوشینگ رو closed-book و الگوریتمی حل کن"}
      ]
    },
    { id:"p3", color:"#c4711f", badge:"فاز ۳", title:"شبیه‌سازی کامل شرایط آزمون", when:"ماه ۸ تا ۱۰",
      goal:"هدف: از تمرین قطعه‌قطعه به تحمل کامل ۱۵۰ سؤال زیر فشار زمان واقعی برس.",
      items:[
        {id:"p3-1", text:"هر ۲ هفته یک آزمون جامع کامل (۱۵۰ سؤال، زمان واقعی، بدون وقفه، بدون گوشی)"},
        {id:"p3-2", text:"بعد از هر آزمون جامع، فقط روی غلط‌ها تمرکز کن نه مرور کامل"},
        {id:"p3-3", text:"مرور کامل فلش‌کارت‌ها با spaced repetition"},
        {id:"p3-4", text:"۳ مبحث ضعیفی که هنوز پیشرفت نکردن رو جداگانه و فشرده مرور کن"},
        {id:"p3-5", text:"حداقل یک بار شبیه‌سازی آزمون شفاهی/OSCE با هم‌گروه یا با کلود"}
      ]
    },
    { id:"p4", color:"#1c8a5a", badge:"فاز ۴", title:"مرور نهایی، بدون مطلب جدید", when:"۲ تا ۴ هفتهٔ آخر",
      goal:"هدف: تثبیت، نه یادگیری. شروع مبحث جدید در این بازه معمولاً نمره رو پایین میاره نه بالا.",
      items:[
        {id:"p4-1", text:"فقط مرور فلش‌کارت‌ها و جداول کلیدی — هیچ مبحث جدیدی شروع نکن"},
        {id:"p4-2", text:"یک آزمون جامع کامل در شرایط تا حد امکان شبیه روز واقعی"},
        {id:"p4-3", text:"مرور نهایی ۳ مبحث ضعیف اصلی"},
        {id:"p4-4", text:"خواب کافی در هفتهٔ آخر — بی‌خوابی شب امتحان جبران‌کنندهٔ هیچ مروری نیست"}
      ]
    }
  ];

  // ---------------------------------------------------------------
  // CONTENT — knowledge map, grouped by Harrison's table of contents
  // ---------------------------------------------------------------
  var TOPICS = []; // loaded from content/taxonomy.json

  var STATUS_ORDER = ["نامشخص","ضعیف","متوسط","خوب"];
  var LEARN_TYPES = [
    {key:"lesson", label:"درسنامه"},
    {key:"flashcards", label:"فلش کارت نکات"},
    {key:"mcq", label:"آزمون ۴ گزینه‌ای"},
    {key:"kfPmp", label:"KF & PMP"},
    {key:"ventSim", label:"شبیه‌سازی ونتیلاتور", onlyFor:["crit-vent"]},
    {key:"images", label:"تصاویر مهم"},
    {key:"tables", label:"جداول مهم"},
    {key:"highlights", label:"هایلایت‌های من"}
  ];
  var contentMap = {}; // loaded lazily: topicId -> content payload
  var contentManifest = {topics:{}};
  var topicLoadPromises = {};

  // ---------------------------------------------------------------
  // DOM refs collected while building (built once, updated in place)
  // ---------------------------------------------------------------
  var phaseItemEls = {};   // id -> {row, cb, note, phaseId}
  var topicEls = {};       // id -> {listBtn, detailEl, pill, note, catId}
  var openTopicDetailId = null;
  var allItemIds = [];
  var allTopicIds = [];

  var phasesRoot = document.getElementById("phasesRoot");
  PHASES.forEach(function(phase, pIdx){
    var el = document.createElement("div");
    el.className = "phase" + (pIdx === 0 ? " open" : "");
    el.style.setProperty("--phase-color", phase.color);

    var head = document.createElement("div");
    head.className = "phase-head";
    head.innerHTML =
      '<div class="phase-head-left"><span class="phase-badge">'+phase.badge+'</span>'+
      '<div class="phase-titles"><h3>'+phase.title+'</h3><div class="when">'+phase.when+'</div></div></div>'+
      '<div class="phase-right"><span class="phase-count num" data-count="'+phase.id+'"></span><span class="chev">▾</span></div>';
    head.addEventListener("click", function(){ el.classList.toggle("open"); });
    el.appendChild(head);

    var body = document.createElement("div");
    body.className = "phase-body";
    var inner = document.createElement("div");
    inner.className = "phase-inner";
    var goal = document.createElement("p");
    goal.className = "goal";
    goal.textContent = phase.goal;
    inner.appendChild(goal);

    phase.items.forEach(function(item){
      var row = document.createElement("div");
      row.className = "item";
      var top = document.createElement("div");
      top.className = "item-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = item.id;
      var label = document.createElement("label");
      label.setAttribute("for", item.id);
      label.textContent = item.text;
      top.appendChild(cb);
      top.appendChild(label);
      row.appendChild(top);
      var note = document.createElement("textarea");
      note.className = "note";
      note.placeholder = "یادداشت: اینجا کجا گیر کردی یا چی رو اشتباه فهمیدی؟";
      row.appendChild(note);
      inner.appendChild(row);

      phaseItemEls[item.id] = {row:row, cb:cb, note:note, phaseId:phase.id};
      allItemIds.push(item.id);

      cb.addEventListener("change", function(){
        writeItemState(item.id, {checked:cb.checked, note: note.value});
      });
      note.addEventListener("input", function(){
        scheduleNoteWrite(item.id, function(){
          writeItemState(item.id, {checked:cb.checked, note: note.value});
        });
      });
    });

    body.appendChild(inner);
    el.appendChild(body);
    phasesRoot.appendChild(el);
  });

  var HEART_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function isFavorite(bucket,id){return !!(bucket.itemState && bucket.itemState["favorite:"+id] && bucket.itemState["favorite:"+id].favorite===true);}
  function goToTopic(id){
    var topic=topicEls[id];if(!topic)return;
    setTab("education");
    if(openTopicDetailId && topicEls[openTopicDetailId]){
      topicEls[openTopicDetailId].itemEl.classList.remove("open");
      topicEls[openTopicDetailId].opener.setAttribute("aria-expanded","false");
    }
    var category=topic.itemEl.closest(".topic-cat");if(category)category.classList.add("open");
    topic.itemEl.classList.add("open");topic.opener.setAttribute("aria-expanded","true");openTopicDetailId=id;
    // Keep the topic below the floating header, including on small screens.
    requestAnimationFrame(function(){
      topic.itemEl.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
      topic.opener.focus({preventScroll:true});
    });
  }
  function renderFavorites(){
    var bucket=myBucket(),favorites=allTopicIds.filter(function(id){return isFavorite(bucket,id);});
    allTopicIds.forEach(function(id){
      var t=topicEls[id],liked=isFavorite(bucket,id);if(!t || !t.favorite)return;
      t.favorite.disabled=usesPrivateBackend() && !stateLoaded;
      t.favorite.classList.toggle("liked",liked);t.favorite.setAttribute("aria-pressed",String(liked));
      t.favorite.setAttribute("aria-label",(liked?"حذف «":"افزودن «")+t.label+"» "+(liked?"از":"به")+" علاقه‌مندی‌ها");
      t.favorite.title=liked?"حذف از علاقه‌مندی‌ها":"افزودن به علاقه‌مندی‌ها";
    });
    var count=document.getElementById("favoriteCount");if(count)count.textContent=faDigits(favorites.length);
    ["dashboardFavorites","profileFavorites"].forEach(function(containerId){
      var container=document.getElementById(containerId);if(!container)return;
      container.replaceChildren();
      if(!favorites.length){var empty=document.createElement("p");empty.className="favorites-empty";empty.textContent="با لمس قلب کنار هر مبحث، آن را به این فهرست اضافه کنید.";container.appendChild(empty);return;}
      favorites.forEach(function(id){var button=document.createElement("button");button.type="button";button.className="favorite-shortcut";button.dataset.favoriteTopic=id;
        var icon=document.createElement("span");icon.innerHTML=HEART_ICON;button.appendChild(icon);
        button.appendChild(document.createTextNode(topicEls[id].label));button.addEventListener("click",function(){goToTopic(id);});container.appendChild(button);
      });
    });
    renderFavoriteStats();
  }
  function renderFavoriteStats(){
    var root=document.getElementById("adminFavoriteStats");if(!root)return;
    root.replaceChildren();
    if(myBucket().backendRole!=="admin")return;
    var counts={},users=0,total=0;
    Object.keys(STATE.users||{}).forEach(function(uid){var voted=false;allTopicIds.forEach(function(id){
      if(isFavorite(STATE.users[uid],id)){counts[id]=(counts[id]||0)+1;total++;voted=true;}
    });if(voted)users++;});
    var ids=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||topicEls[a].label.localeCompare(topicEls[b].label,"fa");});
    var summary=document.getElementById("favoriteStatsSummary");
    if(summary)summary.textContent=faDigits(total)+" لایک · "+faDigits(users)+" کاربر · "+faDigits(ids.length)+" مبحث";
    if(!ids.length){root.textContent="هنوز مبحثی لایک نشده است.";return;}
    ids.forEach(function(id,index){
      var row=document.createElement("button");row.type="button";row.className="favorite-rank";row.dataset.rankedTopic=id;row.style.setProperty("--rank-width",(counts[id]/counts[ids[0]]*100)+"%");
      var name=document.createElement("span");name.textContent=faDigits(index+1)+". "+topicEls[id].label;
      var count=document.createElement("b");count.textContent=faDigits(counts[id])+" لایک";
      row.appendChild(name);row.appendChild(count);row.addEventListener("click",function(){goToTopic(id);});root.appendChild(row);
    });
  }
  var statsRefresh=document.getElementById("refreshFavoriteStats");
  if(statsRefresh)statsRefresh.addEventListener("click",function(){
    statsRefresh.disabled=true;var status=document.getElementById("favoriteStatsStatus");status.textContent="در حال دریافت آخرین آمار…";
    waitForPendingWrites().then(connectGithub).then(function(){
      status.textContent=document.getElementById("connStatus").classList.contains("ok")?"آمار به‌روزرسانی شد.":"دریافت آمار ناموفق بود؛ دوباره تلاش کنید.";
    }).catch(function(){status.textContent="دریافت آمار ناموفق بود؛ اتصال را بررسی کنید.";}).finally(function(){statsRefresh.disabled=false;});
  });

  function buildTopicsUI(){
    var topicsRoot = document.getElementById("topicsRoot");
    topicsRoot.innerHTML = "";
    topicEls = {};
    allTopicIds = [];
  TOPICS.forEach(function(cat){
    var catEl = document.createElement("div");
    catEl.className = "topic-cat";
    catEl.style.setProperty("--cat-color", cat.color);

    var head = document.createElement("div");
    head.className = "cat-head";
    head.innerHTML =
      '<div class="cat-head-left"><span class="cat-dot"></span><span class="cat-title">'+cat.label+'</span></div>'+
      '<div class="phase-right"><span class="content-badge" data-cat-content="'+cat.id+'"></span><span class="cat-stat num" data-cat-stat="'+cat.id+'"></span><span class="chev">▾</span></div>';
    head.addEventListener("click", function(){ catEl.classList.toggle("open"); });
    catEl.appendChild(head);

    var body = document.createElement("div");
    body.className = "cat-body";
    var inner = document.createElement("div");
    inner.className = "cat-inner";

    cat.subs.forEach(function(sub){
      var item = document.createElement("div");
      item.className = "topic-item";

      var listBtn = document.createElement("div");
      listBtn.className = "topic-list-btn";

      var title = document.createElement("span");
      title.className = "topic-list-title";
      title.textContent = sub.label;
      var topicOpener=document.createElement("button");
      topicOpener.type="button";topicOpener.className="topic-open-btn";
      topicOpener.setAttribute("aria-expanded","false");
      topicOpener.appendChild(title);

      var contentBadge = document.createElement("span");
      contentBadge.className = "content-badge";

      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "topic-pill st-نامشخص";
      pill.textContent = "نامشخص";
      pill.addEventListener("click", function(e){
        e.stopPropagation();
        var current = topicEls[sub.id].status || "نامشخص";
        var idx = STATUS_ORDER.indexOf(current);
        var next = STATUS_ORDER[(idx+1) % STATUS_ORDER.length];
        topicEls[sub.id].status = next;
        pill.className = "topic-pill st-" + next;
        pill.textContent = next;
        writeTopicState(sub.id, {status: next, note: note.value});
        updateCatStat(cat);renderStudyDashboard();
      });

      var chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = "▾";

      listBtn.appendChild(topicOpener);
      listBtn.appendChild(contentBadge);
      listBtn.appendChild(pill);
      var favorite=document.createElement("button");
      favorite.type="button";favorite.className="topic-favorite";
      favorite.innerHTML=HEART_ICON;
      favorite.setAttribute("aria-label","افزودن «"+sub.label+"» به علاقه‌مندی‌ها");
      favorite.setAttribute("aria-pressed","false");
      favorite.addEventListener("click",function(e){
        e.stopPropagation();
        var key="favorite:"+sub.id;
        myBucket().itemState[key]={favorite:!isFavorite(myBucket(),sub.id)};
        scheduleFlush(400);renderFavorites();renderStudyDashboard();
      });
      listBtn.appendChild(favorite);
      listBtn.appendChild(chev);

      var detail = document.createElement("div");
      detail.className = "topic-detail";

      var note = document.createElement("textarea");
      note.className = "topic-note";
      note.placeholder = "یادداشت کوتاه دربارهٔ این مبحث...";
      note.addEventListener("input", function(){
        scheduleNoteWrite(sub.id, function(){
          writeTopicState(sub.id, {status: topicEls[sub.id].status || "نامشخص", note: note.value});
        });
      });
      detail.appendChild(note);
      var tagBox=document.createElement("div");tagBox.className="study-tag-controls";tagBox.dataset.tagTopic=sub.id;
      ["مهم","نیاز به مرور","مطالعه‌شده"].forEach(function(tag){
        var button=document.createElement("button");button.type="button";button.className="study-tag-button";button.textContent=tag;button.dataset.studyTag=tag;button.setAttribute("aria-pressed","false");
        button.addEventListener("click",function(){window.IntMedDashboard.toggleTag(sub.id,tag);});tagBox.appendChild(button);
      });detail.appendChild(tagBox);

      var learnRow = document.createElement("div");
      learnRow.className = "learn-row";
      var hlRow = document.createElement("div");
      hlRow.className = "learn-row learn-row-highlights";
      var hlRowLabel = document.createElement("span");
      hlRowLabel.className = "learn-row-highlights-label";
      hlRowLabel.textContent = "هایلایت و یادداشت‌های شخصی من در این مبحث:";
      hlRow.appendChild(hlRowLabel);
      var learnPanel = document.createElement("div");
      learnPanel.className = "learn-panel";
      var learnBtns = {};
      LEARN_TYPES.forEach(function(lt){
        if(lt.onlyFor && lt.onlyFor.indexOf(sub.id) === -1) return;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "learn-btn";
        b.innerHTML = lt.label + '<span class="cnt" data-lc="'+sub.id+'-'+lt.key+'"></span>';
        b.addEventListener("click", function(e){
          e.stopPropagation();
          if(window.IntMedDashboard)window.IntMedDashboard.stop();
          var isActive = b.classList.contains("active");
          learnRow.querySelectorAll(".learn-btn").forEach(function(x){ x.classList.remove("active"); });
          hlRow.querySelectorAll(".learn-btn").forEach(function(x){ x.classList.remove("active"); });
          if(isActive){
            learnPanel.classList.remove("open");
            topicEls[sub.id].openType = null;
          } else {
            b.classList.add("active");
            learnPanel.classList.add("open");
            topicEls[sub.id].openType = lt.key;
            ensureTopicLoaded(sub.id).then(function(){
              if(topicEls[sub.id].openType === lt.key){renderLearnPanel(sub.id, lt.key);if(window.IntMedDashboard)window.IntMedDashboard.open(sub.id,lt.key);}
            }).catch(function(){
              if(topicEls[sub.id].openType !== lt.key) return;
              learnPanel.innerHTML = '<div class="learn-empty">بارگذاری این مبحث ناموفق بود. اتصال را بررسی و دوباره تلاش کنید.</div>';
            });
          }
        });
        learnBtns[lt.key] = b;
        if(lt.key === "highlights"){ hlRow.appendChild(b); } else { learnRow.appendChild(b); }
      });
      detail.appendChild(learnRow);
      detail.appendChild(hlRow);
      detail.appendChild(learnPanel);

      listBtn.addEventListener("click", function(){
        var willOpen = openTopicDetailId !== sub.id;
        if(openTopicDetailId && topicEls[openTopicDetailId]){
          topicEls[openTopicDetailId].itemEl.classList.remove("open");
          topicEls[openTopicDetailId].opener.setAttribute("aria-expanded","false");
        }
        openTopicDetailId = willOpen ? sub.id : null;
        item.classList.toggle("open", willOpen);
        topicOpener.setAttribute("aria-expanded",String(willOpen));
        if(!willOpen && window.IntMedDashboard)window.IntMedDashboard.stop();
      });

      item.appendChild(listBtn);
      item.appendChild(detail);
      inner.appendChild(item);

      topicEls[sub.id] = {label:sub.label, favorite:favorite, opener:topicOpener, itemEl:item, pill:pill, contentBadge:contentBadge, note:note, catId:cat.id, status:"نامشخص", learnBtns:learnBtns, learnPanel:learnPanel, openType:null};
      allTopicIds.push(sub.id);
    });

    body.appendChild(inner);
    catEl.appendChild(body);
    topicsRoot.appendChild(catEl);
  });

  TOPICS.forEach(updateCatStat);
  }

  function updateCatStat(cat){
    var good = cat.subs.filter(function(s){ return topicEls[s.id].status === "خوب"; }).length;
    var el = document.querySelector('.cat-stat[data-cat-stat="'+cat.id+'"]');
    if(el) el.textContent = faDigits(good) + "/" + faDigits(cat.subs.length) + " خوب";
  }

  function topicHasContent(topicId){
    var data = contentMap[topicId];
    var metadata = contentManifest.topics && contentManifest.topics[topicId];
    if(!data && metadata){
      return Object.keys(metadata.counts || {}).some(function(key){ return (metadata.counts[key] || 0) > 0; });
    }
    if(!data) return null;
    return LEARN_TYPES.some(function(lt){
      if(lt.key === "highlights") return false; // personal annotations, not board-prep content
      return (data[lt.key] || []).length > 0;
    });
  }

  function updateContentBadge(topicId){
    var t = topicEls[topicId];
    if(!t || !t.contentBadge) return;
    var has = topicHasContent(topicId);
    if(has === null){
      t.contentBadge.textContent = "";
      t.contentBadge.className = "content-badge";
      return;
    }
    t.contentBadge.textContent = has ? "حاوی مطلب" : "ناقص";
    t.contentBadge.className = "content-badge " + (has ? "has" : "empty");
  }

  function updateCatContentBadge(cat){
    var el = document.querySelector('.content-badge[data-cat-content="'+cat.id+'"]');
    if(!el) return;
    var states = cat.subs.map(function(s){ return topicHasContent(s.id); });
    if(states.every(function(s){ return s === null; })){
      el.textContent = "";
      el.className = "content-badge";
      return;
    }
    var anyHas = states.some(function(s){ return s === true; });
    el.textContent = anyHas ? "حاوی مطلب" : "ناقص";
    el.className = "content-badge " + (anyHas ? "has" : "empty");
  }

  var hereSelect = document.getElementById("hereSelect");
  var autoOpt = document.createElement("option");
  autoOpt.value = ""; autoOpt.textContent = "خودکار (پیش‌فرض)";
  hereSelect.appendChild(autoOpt);
  PHASES.forEach(function(phase){
    var opt = document.createElement("option");
    opt.value = phase.id;
    opt.textContent = phase.badge + " — " + phase.title;
    hereSelect.appendChild(opt);
  });

  // ---------------------------------------------------------------
  // Progress / "الان اینجام"
  // ---------------------------------------------------------------
  function updatePhaseCounts(){
    PHASES.forEach(function(phase){
      var done = phase.items.filter(function(it){ return phaseItemEls[it.id].cb.checked; }).length;
      var badge = document.querySelector('.phase-count[data-count="'+phase.id+'"]');
      if(badge) badge.textContent = faDigits(done) + "/" + faDigits(phase.items.length);
    });
  }

  function updateOverallBar(){
    var total = allItemIds.length;
    var done = allItemIds.filter(function(id){ return phaseItemEls[id].cb.checked; }).length;
    var pct = total ? Math.round(done/total*100) : 0;
    document.getElementById("barFill").style.width = pct + "%";
    document.getElementById("barPct").textContent = faDigits(pct) + "٪";
  }

  function detectAutoPhase(){
    for(var i=0;i<PHASES.length;i++){
      var items = PHASES[i].items;
      var allDone = items.length && items.every(function(it){ return phaseItemEls[it.id].cb.checked; });
      if(!allDone) return PHASES[i];
    }
    return PHASES[PHASES.length-1];
  }

  var currentOverride = null;
  function updateHereCard(){
    var phase = currentOverride ? PHASES.filter(function(p){ return p.id === currentOverride; })[0] : null;
    if(!phase) phase = detectAutoPhase();

    document.getElementById("hereTitle").textContent = phase.badge + " — " + phase.title;
    document.getElementById("hereSub").textContent = phase.when + " · " + phase.goal;

    var nextItem = phase.items.filter(function(it){ return !phaseItemEls[it.id].cb.checked; })[0];
    var nextEl = document.getElementById("hereNext");
    if(nextItem){
      nextEl.innerHTML = '<b>قدم بعدی:</b> ' + nextItem.text;
    } else {
      nextEl.innerHTML = '<b>همهٔ آیتم‌های این فاز تیک خورده.</b> اگه فاز بعدی رو شروع کردی، دستی عوضش کن یا بذار خودکار تشخیص بده.';
    }
    if(hereSelect.value !== (currentOverride || "")) hereSelect.value = currentOverride || "";
  }

  hereSelect.addEventListener("change", function(){
    var val = hereSelect.value || null;
    currentOverride = val;
    updateHereCard();
    writeMeta({currentPhaseOverride: val});
  });

  function renderStudyDashboard(){if(window.IntMedDashboard)window.IntMedDashboard.render();}
  function refreshAll(){
    updatePhaseCounts();
    updateOverallBar();
    updateHereCard();
    renderFavorites();
    renderStudyDashboard();
  }

  // ---------------------------------------------------------------
  // GitHub-backed state sync (progress, notes, highlights).
  // This is a plain static site (GitHub Pages) with no backend, so
  // persistence/cross-device sync is implemented via the GitHub Contents
  // API against a dedicated branch (study-state) that Pages never builds
  // from. Each device stores its own Personal Access Token in
  // localStorage and does whole-document GET-before-PUT writes —
  // simple last-write-wins at the document level, not a field-level
  // merge. Fine for one person's own few devices; two tabs saving at
  // literally the same moment can clobber each other.
  // ---------------------------------------------------------------
  var GH_OWNER = "4mirgr";
  var GH_REPO = "intMed-study-plan";
  var GH_BRANCH = "study-state";
  var GH_PATH = "state.json";
  var GH_API = "https://api.github.com/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/" + GH_PATH;

  function mergeObj(a, b){
    var out = {}, k;
    for(k in a){ if(a.hasOwnProperty(k)) out[k] = a[k]; }
    for(k in b){ if(b.hasOwnProperty(k)) out[k] = b[k]; }
    return out;
  }
  function b64EncodeUtf8(str){ return btoa(unescape(encodeURIComponent(str))); }
  function b64DecodeUtf8(str){ return decodeURIComponent(escape(atob(str.replace(/\n/g, "")))); }

  function getPat(){ try{ return localStorage.getItem("gh_pat") || ""; }catch(e){ return ""; } }
  function setPat(v){ try{ if(v){ localStorage.setItem("gh_pat", v); } else { localStorage.removeItem("gh_pat"); } }catch(e){} }
  function usesPrivateBackend(){ return !!(window.IntMedBackend && window.IntMedBackend.isConfigured()); }
  function legacySyncAllowed(){
    return !!(window.INTMED_CONFIG || {}).allowLegacyDemo && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  }
  function hasPersistenceCredentials(){
    if(!usesPrivateBackend())return legacySyncAllowed() && !!getPat();
    var session=window.IntMedBackend.session();return !!(session && session.user && !session.recovery);
  }
  function ghHeaders(){
    return {
      "Authorization": "Bearer " + getPat(),
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function ghFetchState(){
    if(usesPrivateBackend()) return window.IntMedBackend.loadLegacyState();
    if(!legacySyncAllowed()) return Promise.reject(new Error("auth"));
    return fetch(GH_API + "?ref=" + GH_BRANCH, { headers: ghHeaders() })
      .then(function(r){
        if(r.status === 401 || r.status === 403) throw new Error("auth");
        if(!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function(json){
        return JSON.parse(b64DecodeUtf8(json.content));
      });
  }

  function ghSaveState(stateObj){
    if(usesPrivateBackend()) return window.IntMedBackend.saveLegacyState(stateObj);
    if(!legacySyncAllowed()) return Promise.reject(new Error("auth"));
    return fetch(GH_API + "?ref=" + GH_BRANCH, { headers: ghHeaders() })
      .then(function(r){
        if(r.status === 401 || r.status === 403) throw new Error("auth");
        return r.ok ? r.json() : null;
      })
      .then(function(json){
        var body = {
          message: "update study state " + new Date().toISOString(),
          content: b64EncodeUtf8(JSON.stringify(stateObj)),
          branch: GH_BRANCH
        };
        if(json && json.sha) body.sha = json.sha;
        return fetch(GH_API, {
          method: "PUT",
          headers: mergeObj({"Content-Type":"application/json"}, ghHeaders()),
          body: JSON.stringify(body)
        });
      })
      .then(function(r){
        if(r.status === 401 || r.status === 403) throw new Error("auth");
        // 409/422 = the PUT's sha no longer matches the branch's HEAD — another
        // device/user saved first (expected now that several real people share
        // this one state.json). Not an auth problem, and not a dead end: the
        // next GET-sha-then-PUT attempt picks up the fresh sha and just works,
        // so doFlush() retries this quickly instead of leaving it stuck on error.
        if(r.status === 409 || r.status === 422) throw new Error("conflict");
        if(!r.ok) throw new Error("http " + r.status);
      });
  }

  // STATE.users namespaces each logged-in person's own data inside the one
  // shared state.json — see CURRENT_USER_ID above. myBucket() always returns
  // (creating if needed) the bucket for whoever is currently logged in.
  var STATE = { version:2, users:{}, tickets:[], signups:[] };
  var stateLoaded=false;
  function emptyBucket(){ return {itemState:{}, meta:{currentPhaseOverride:null}, highlights:{}, profile:{}, loginLog:[]}; }
  function myBucket(){
    if(!STATE.users[CURRENT_USER_ID]) STATE.users[CURRENT_USER_ID] = emptyBucket();
    var b = STATE.users[CURRENT_USER_ID];
    if(!b.profile) b.profile = {};
    if(!b.loginLog) b.loginLog = [];
    return b;
  }

  function setConn(kind){
    var el = document.getElementById("connStatus");
    if(kind === "online"){ el.textContent = "آنلاین ✓"; el.className = "conn num ok"; }
    else if(kind === "connecting"){ el.textContent = "در حال اتصال..."; el.className = "conn num"; }
    else if(kind === "nopat"){ el.textContent = "برای ذخیره‌سازی وصل نیست"; el.className = "conn num bad"; }
    else if(kind === "error"){ el.textContent = "خطا در همگام‌سازی"; el.className = "conn num bad"; }
    else if(kind === "auth"){ el.textContent = usesPrivateBackend() ? "نشست پایان یافته؛ دوباره وارد شوید" : "اتصال معتبر نیست"; el.className = "conn num bad"; }
    var reminder = document.getElementById("connectReminderBox");
    if(usesPrivateBackend()){
      var message = document.querySelector("#connectReminderBox .connect-reminder-text");
      if(message) message.textContent = kind === "auth" || kind === "nopat"
        ? "برای ادامهٔ ذخیره‌سازی با نام کاربری و رمز حساب خود دوباره وارد شوید. نیازی به توکن GitHub ندارید."
        : "همگام‌سازی موقتاً قطع شده است؛ اتصال خودکار دوباره امتحان می‌شود. تا نمایش وضعیت آنلاین، صفحه را نبندید.";
      var retry = document.getElementById("connectReminderBtn");
      if(retry) retry.textContent = kind === "auth" || kind === "nopat" ? "ورود مجدد" : "تلاش مجدد";
    }
    if(reminder) reminder.style.display = (kind === "nopat" || kind === "error" || kind === "auth") ? "" : "none";
  }

  var flushTimer = null, flushing = false, flushQueued = false, dirty = false;
  function cleanedStateForSave(){
    var users = {}, uid, k;
    for(uid in STATE.users){
      if(!STATE.users.hasOwnProperty(uid)) continue;
      var bucket = STATE.users[uid];
      var hl = {};
      for(k in bucket.highlights){
        if(bucket.highlights.hasOwnProperty(k) && bucket.highlights[k] && bucket.highlights[k].length){
          hl[k] = bucket.highlights[k];
        }
      }
      users[uid] = {
        itemState: bucket.itemState || {}, meta: bucket.meta || {currentPhaseOverride:null}, highlights: hl,
        profile: bucket.profile || {}, loginLog: (bucket.loginLog || []).slice(-500)
      };
    }
    return {
      version:2, updatedAt:new Date().toISOString(), users: users,
      tickets: (STATE.tickets || []).slice(-1000), signups: (STATE.signups || []).slice(-1000)
    };
  }
  function doFlush(){
    if(!hasPersistenceCredentials()) return;
    if(flushing){ flushQueued = true; return; }
    flushing = true;
    dirty = false;
    ghSaveState(cleanedStateForSave()).then(function(){
      flushing = false;
      setConn("online");
      if(flushQueued){ flushQueued = false; scheduleFlush(200); }
    }).catch(function(err){
      flushing = false;
      var isAuth = err && (err.message === "auth" || err.status === 401);
      var isConflict = err && err.message === "conflict";
      setConn(isAuth ? "auth" : "error");
      // Bug fixed 2026-10-05: this used to just set the red "error" status and
      // stop — dirty was already cleared above, so nothing retried it until the
      // user happened to make an unrelated new edit. A real token problem (auth)
      // still needs the user to reconnect, but a conflict (another device/user
      // saved first) or a plain network hiccup should retry on their own —
      // scheduleFlush() re-marks dirty and requeues, quickly for a conflict
      // (the next attempt's fresh sha just works), a bit slower for anything else.
      if(!isAuth) scheduleFlush(isConflict ? 2500 : 8000);
    });
  }
  function waitForPendingWrites(){
    return new Promise(function(resolve,reject){
      var started=Date.now();
      function check(){
        if(Date.now()-started>15000){reject(new Error("همگام‌سازی هنوز تمام نشده است؛ پس از برقراری اتصال دوباره حذف را امتحان کنید."));return;}
        if(flushing){setTimeout(check,100);return;}
        if(dirty || flushQueued){
          if(!flushTimer){flushQueued=false;doFlush();}
          setTimeout(check,100);return;
        }
        resolve();
      }
      check();
    });
  }
  function scheduleFlush(delay){
    if(!hasPersistenceCredentials()) return;
    dirty = true;
    if(flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function(){ flushTimer = null; doFlush(); }, delay == null ? 400 : delay);
  }
  setInterval(function(){
    if(dirty && !flushing && !flushTimer) doFlush();
  }, 20000);
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "hidden" && flushTimer){ clearTimeout(flushTimer); flushTimer = null; doFlush(); }
  });

  var noteTimers = {};
  function scheduleNoteWrite(id, fn){
    if(noteTimers[id]) clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(fn, 600);
  }

  function writeItemState(id, data){
    myBucket().itemState[id] = data;
    scheduleFlush(400);
  }
  function writeTopicState(id, data){
    myBucket().itemState[id] = data;
    scheduleFlush(400);
  }
  function writeMeta(data){
    myBucket().meta = mergeObj(myBucket().meta, data);
    scheduleFlush(400);
  }

  function applyLoadedState(){
    var id, data, p, t, status;
    var bucket = myBucket();
    for(id in bucket.itemState){
      if(!bucket.itemState.hasOwnProperty(id)) continue;
      data = bucket.itemState[id] || {};
      p = phaseItemEls[id];
      if(p){
        p.cb.checked = !!data.checked;
        p.row.classList.toggle("done", !!data.checked);
        if(document.activeElement !== p.note) p.note.value = data.note || "";
        continue;
      }
      t = topicEls[id];
      if(t){
        status = data.status || "نامشخص";
        t.status = status;
        t.pill.className = "topic-pill st-" + status;
        t.pill.textContent = status;
        if(document.activeElement !== t.note) t.note.value = data.note || "";
      }
    }
    TOPICS.forEach(updateCatStat);
    currentOverride = (bucket.meta && bucket.meta.currentPhaseOverride) || null;
    refreshAll();
    allTopicIds.forEach(function(tid){
      updateLearnCounts(tid);
      var te = topicEls[tid];
      if(te && te.openType) renderLearnPanel(tid, te.openType);
    });
  }

  // A state.json written before multi-user support has itemState/meta/highlights
  // at the top level instead of under STATE.users — treat that as the original
  // user's ("amir") data so nothing is lost on first load after this update.
  function migrateStateShape(remote){
    if(remote && remote.users){
      if(!remote.tickets) remote.tickets = [];
      if(!remote.signups) remote.signups = [];
      return remote;
    }
    var legacy = remote || {};
    var users = {};
    users.amir = {
      itemState: legacy.itemState || {},
      meta: legacy.meta || {currentPhaseOverride:null},
      highlights: legacy.highlights || {},
      profile: {}, loginLog: []
    };
    return { version:2, users: users, tickets: [], signups: [] };
  }

  // Marks a usage event for the currently logged-in user — called once per
  // app session (right after a successful GitHub-backed state load), so the
  // admin panel can show "how many times / when" without spamming an entry
  // per page interaction. A 5-minute dedupe window means reloading the same
  // tab repeatedly doesn't flood the log.
  function logLoginIfDue(){
    var log = myBucket().loginLog;
    var now = Date.now();
    var last = log.length ? Date.parse(log[log.length - 1].at) : 0;
    if(!last || isNaN(last) || (now - last) > 5 * 60 * 1000){
      log.push({ at: new Date().toISOString() });
      if(log.length > 500) log.splice(0, log.length - 500);
      scheduleFlush(600);
    }
  }

  // Bug fixed 2026-10-04: connectGithub() used to do a blind
  // `STATE = migrateStateShape(remote)`, which silently discarded any
  // not-yet-flushed local data — most commonly a ticket typed and sent
  // *before* the user had ever connected a token (scheduleFlush/doFlush
  // no-op without a PAT, so it only ever lived in local STATE), wiped the
  // instant the user then connected. Same hole existed for itemState/
  // highlights/profile/signups edited right before a reconnect. Reported by
  // the user: a ticket from "arash" never appeared in the admin panel even
  // after connecting with a token. Fix: merge whatever the local STATE
  // holds into the freshly-fetched remote (local wins per-key for things
  // that can only be edited by this user, append-by-id for lists) before
  // replacing STATE, then flush the merge back so it isn't lost again on
  // the next connect.
  function mergeLocalIntoRemote(local, migrated){
    var mergedAnything = false;
    var localTickets = (local && local.tickets) || [];
    if(localTickets.length){
      var knownTicketIds = {};
      migrated.tickets.forEach(function(t){ knownTicketIds[t.id] = true; });
      localTickets.forEach(function(t){
        if(!knownTicketIds[t.id]){ migrated.tickets.push(t); mergedAnything = true; }
      });
    }
    var localSignups = (local && local.signups) || [];
    if(localSignups.length){
      var knownSignupIds = {};
      migrated.signups.forEach(function(s){ knownSignupIds[s.id] = true; });
      localSignups.forEach(function(s){
        if(!knownSignupIds[s.id]){ migrated.signups.push(s); mergedAnything = true; }
      });
    }
    var localBucket = local && local.users && local.users[CURRENT_USER_ID];
    if(localBucket){
      if(!migrated.users[CURRENT_USER_ID]) migrated.users[CURRENT_USER_ID] = emptyBucket();
      var remoteBucket = migrated.users[CURRENT_USER_ID];
      var k;
      for(k in localBucket.itemState){
        if(localBucket.itemState.hasOwnProperty(k)){ remoteBucket.itemState[k] = localBucket.itemState[k]; mergedAnything = true; }
      }
      for(k in localBucket.highlights){
        if(!localBucket.highlights.hasOwnProperty(k)) continue;
        var localArr = localBucket.highlights[k] || [];
        if(!localArr.length) continue;
        if(!remoteBucket.highlights[k]) remoteBucket.highlights[k] = [];
        var knownHlIds = {};
        remoteBucket.highlights[k].forEach(function(h){ knownHlIds[h.id] = true; });
        localArr.forEach(function(h){
          if(!knownHlIds[h.id]){ remoteBucket.highlights[k].push(h); mergedAnything = true; }
        });
      }
      if(localBucket.profile && localBucket.profile.updatedAt){
        if(!remoteBucket.profile || !remoteBucket.profile.updatedAt || localBucket.profile.updatedAt >= remoteBucket.profile.updatedAt){
          remoteBucket.profile = localBucket.profile;
          mergedAnything = true;
        }
      }
      var localLog = (localBucket.loginLog || []);
      if(localLog.length){
        remoteBucket.loginLog = remoteBucket.loginLog || [];
        var knownLogTimes = {};
        remoteBucket.loginLog.forEach(function(e){ knownLogTimes[e.at] = true; });
        localLog.forEach(function(e){
          if(!knownLogTimes[e.at]){ remoteBucket.loginLog.push(e); mergedAnything = true; }
        });
      }
    }
    return mergedAnything;
  }

  var connectRetryCount = 0;
  function connectGithub(){
    setConn("connecting");
    var localSnapshot = STATE;
    return ghFetchState().then(function(remote){
      connectRetryCount = 0;
      var migrated = migrateStateShape(remote);
      if(!migrated.users) migrated.users = {};
      if(!migrated.tickets) migrated.tickets = [];
      if(!migrated.signups) migrated.signups = [];
      // A clean private tab should accept fresh cross-device state instead of
      // copying its stale snapshot over the server during an analytics refresh.
      var hasLocalChanges=!stateLoaded || dirty || flushing || flushQueued || !!flushTimer;
      var mergedAnything = (!usesPrivateBackend() || hasLocalChanges) && mergeLocalIntoRemote(localSnapshot, migrated);
      STATE = migrated;
      stateLoaded=true;
      setConn("online");
      applyLoadedState();
      logLoginIfDue();
      renderUserPanel();
      updateGhBtn();
      // A dynamically-approved signup user isn't in the static USER_NAMES
      // map the header label resolved from at script-load time — backfill
      // from their own saved profile name once it's loaded.
      if(!USER_NAMES[CURRENT_USER_ID]){
        var ownName = (myBucket().profile && myBucket().profile.fullName) || "";
        if(ownName){
          var labelEl = document.getElementById("userLabel");
          if(labelEl) labelEl.textContent = ownName;
        }
      }
      // Local-only data (e.g. a ticket typed before this connect) just got
      // merged in-memory above — write it back now so a second connect
      // right after this one doesn't lose it again before the normal
      // debounced flush would have fired.
      if(mergedAnything) scheduleFlush(200);
    }).catch(function(err){
      var isAuth = err && (err.message === "auth" || err.status === 401);
      setConn(isAuth ? "auth" : "error");
      updateGhBtn();
      // Same spirit as doFlush()'s retry below: a plain network hiccup on the
      // very first connect shouldn't leave the header permanently stuck on
      // "error" — retry a few times on its own. An auth failure needs a real
      // token from the user, so that one still stops here and waits for them.
      if(!isAuth && connectRetryCount < 3){
        connectRetryCount++;
        setTimeout(connectGithub, 4000);
      }
    });
  }

  // ---------------------------------------------------------------
  // Profile / ticket (non-admin users) + admin panel (amir only).
  // Tickets live at STATE.tickets (top level, shared — every user's
  // messages, not namespaced per-user like itemState/highlights), since
  // the admin needs to see everyone's. Login history and profile fields
  // are per-user (myBucket().profile / .loginLog) alongside the existing
  // itemState/meta/highlights.
  // ---------------------------------------------------------------
  // Same hash used by the login gate — duplicated here (separate IIFE/closure)
  // so the admin's "add signup" mini-form can compute a login-compatible
  // hash from a password the admin types in, without touching the gate's
  // own scope.
  function fnv1aHex(str){
    var h = 0x811c9dc5;
    for(var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  function normalizeDigits(s){
    return String(s)
      .replace(/[‌‎‏‪-‮]/g, "")
      .replace(/[۰-۹]/g, function(d){ return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)); })
      .replace(/[٠-٩]/g, function(d){ return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); })
      .trim();
  }

  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function formatFaDateTime(iso){
    try{
      var d = new Date(iso);
      var dateStr = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {year:"numeric", month:"short", day:"numeric"}).format(d);
      var timeStr = new Intl.DateTimeFormat("fa-IR", {hour:"2-digit", minute:"2-digit"}).format(d);
      return dateStr + "، " + timeStr;
    }catch(e){ return ""; }
  }

  // Editable biographical fields. Auth email is read-only here; its separate
  // account action uses Supabase email verification.
  var PROFILE_FIELDS = [
    {key:"fullName", label:"نام و نام خانوادگی", type:"text", placeholder:"مثلاً: علی رضایی"},
    {key:"degree", label:"آخرین مدرک تحصیلی", type:"text", placeholder:"مدرک تحصیلی"},
    {key:"specialty", label:"رشته", type:"text", placeholder:"رشتهٔ پزشکی"},
    {key:"province", label:"استان", type:"text", placeholder:"استان"},
    {key:"idNumber", label:"شماره نظام پزشکی / شماره دانشجویی", type:"text", placeholder:"مثلاً: ۱۲۳۴۵۶"},
    {key:"phone", label:"شماره موبایل", type:"tel", placeholder:"مثلاً: ۰۹۱۲۱۲۳۴۵۶۷"},
    {key:"email", label:"ایمیل", type:"email", placeholder:"مثلاً: name@example.com"}
  ];
  var myProfileGridEl = document.getElementById("myProfileGrid");
  // Profile changes always retain the same account UUID and study bucket.
  function renderMyProfileFields(){
    if(!myProfileGridEl) return;
    var p = myBucket().profile || {};
    myProfileGridEl.innerHTML = PROFILE_FIELDS.map(function(f){
      var value=p[f.key]||"",field='<input type="'+f.type+'" id="profileInput-'+f.key+'" data-profile-field="'+f.key+'" value="'+escapeHtml(value)+'" placeholder="'+f.placeholder+'"'+(f.key==='email'?' readonly':'')+'>';
      if(f.key==='degree' && window.IntMedRegistration){
        var choices=window.IntMedRegistration.degrees.slice();if(value && choices.indexOf(value)===-1)choices.unshift(value);
        field='<select id="profileInput-degree"><option value="">انتخاب مدرک</option>'+choices.map(function(v){return '<option'+(v===value?' selected':'')+'>'+escapeHtml(v)+'</option>';}).join('')+'</select>';
      }
      if((f.key==='province'||f.key==='specialty') && window.IntMedRegistration){
        var options=f.key==='province'?window.IntMedRegistration.provinces:window.IntMedRegistration.specialties;
        field=field.replace(' data-profile-field=', ' list="profile-options-'+f.key+'" data-profile-field=')+'<datalist id="profile-options-'+f.key+'">'+options.map(function(v){return '<option value="'+escapeHtml(v)+'">';}).join('')+'</datalist>';
      }
      return '<div class="profile-field"><label for="profileInput-'+f.key+'">'+f.label+'</label>'+field+'</div>';
    }).join("");
    var username=document.getElementById("accountUsername");if(username)username.value=myBucket().backendUsername||"";
    var email=document.getElementById("accountEmail");if(email)email.value=p.email||"";
  }

  var profileSaveBtn = document.getElementById("profileSaveBtn");
  var profileSavedNote = document.getElementById("profileSavedNote");
  var ticketMessageEl = document.getElementById("ticketMessage");
  var ticketSendBtn = document.getElementById("ticketSendBtn");
  var adminTabUsers = document.getElementById("adminTabUsers");
  var adminTabTickets = document.getElementById("adminTabTickets");
  var adminUsersPanel = document.getElementById("adminUsersPanel");
  var adminUserSearchEl = document.getElementById("adminUserSearch");
  var accountFilter=document.getElementById("adminUserStatusFilter");if(accountFilter)accountFilter.addEventListener("change",renderAdminUsers);
  var adminTicketsPanel = document.getElementById("adminTicketsPanel");
  var adminTicketBadge = document.getElementById("adminTicketBadge");

  // Best-effort mirror of a saved profile into the "IntMed - کاربران و
  // ثبت‌نام‌ها" Google Sheet, via a Google Apps Script Web App bound to that
  // sheet (the only way a static page with no backend can append/update a
  // sheet row live — the Drive/Sheets tools available when this was built
  // only support whole-file create, not a values-append call, so there is
  // no way to do this from a Claude Code session on every save; the Apps
  // Script runs on Google's own infrastructure instead). No-ops silently
  // until GOOGLE_SHEET_WEBHOOK_URL is filled in with a deployed Web App
  // URL — see CLAUDE.md for the exact script + deployment steps.
  var GOOGLE_SHEET_WEBHOOK_URL = "";
  function syncProfileToSheet(userId, profile){
    if(!GOOGLE_SHEET_WEBHOOK_URL) return;
    try{
      fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: {"Content-Type": "text/plain;charset=utf-8"},
        body: JSON.stringify({
          userId: userId,
          username: userId,
          fullName: profile.fullName || "",
          degree: profile.degree || "",
          idNumber: profile.idNumber || "",
          phone: profile.phone || "",
          email: profile.email || "",
          updatedAt: profile.updatedAt || ""
        })
      }).catch(function(){});
    }catch(e){}
  }

  if(profileSaveBtn){
    profileSaveBtn.addEventListener("click",function(){
      var p=Object.assign({},myBucket().profile||{});
      PROFILE_FIELDS.forEach(function(f){var input=document.getElementById("profileInput-"+f.key);if(input && f.key!=="email")p[f.key]=input.value.trim();});
      if(!p.fullName){profileSavedNote.textContent="نام و نام خانوادگی را وارد کنید.";return;}
      var lists=window.IntMedRegistration;
      if(lists && ((p.province && !lists.provinces.includes(p.province)) || (p.specialty && !lists.specialties.includes(p.specialty)))){profileSavedNote.textContent="رشته و استان را از فهرست انتخاب کنید.";return;}
      profileSaveBtn.disabled=true;profileSavedNote.textContent="در حال ذخیره…";
      waitForPendingWrites().then(function(){return window.IntMedBackend.updateProfile(p);}).then(function(){
        // Same UUID, separate profile PATCH: never replace study_state/highlights.
        myBucket().profile=p;var label=document.getElementById("userLabel");if(label)label.textContent=p.fullName;
        profileSavedNote.textContent="مشخصات ذخیره شد؛ اطلاعات مطالعه محفوظ است ✓";renderStudyDashboard();
      }).catch(function(e){profileSavedNote.textContent=e.message||"ذخیره ناموفق بود.";}).finally(function(){profileSaveBtn.disabled=false;});
    });
  }
  var accountSave=document.getElementById("accountSave");
  if(accountSave)accountSave.addEventListener("click",function(){
    var username=document.getElementById("accountUsername").value.trim().toLowerCase(),email=document.getElementById("accountEmail").value.trim(),status=document.getElementById("accountStatus");
    if(!/^[a-z0-9_.-]{3,64}$/.test(username)){status.textContent="نام کاربری باید ۳ تا ۶۴ نویسهٔ انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.";return;}
    var emailInput=document.getElementById("accountEmail");if(!emailInput.reportValidity())return;
    accountSave.disabled=true;status.textContent="در حال بررسی…";
    waitForPendingWrites().then(function(){
      if(username!==myBucket().backendUsername)return window.IntMedBackend.updateUsername(username).then(function(){myBucket().backendUsername=username;});
    }).then(function(){
      if(email!==(myBucket().profile.email||""))return window.IntMedBackend.updateEmail(email).then(function(){status.textContent="نام کاربری ذخیره شد. تغییر ایمیل پس از تأیید لینک‌های ایمیل انجام می‌شود؛ سپس دوباره وارد شوید.";});
      status.textContent="اطلاعات حساب ذخیره شد؛ شناسه و اطلاعات مطالعه تغییر نکرده‌اند ✓";
    }).catch(function(e){status.textContent=e.status===404?"تغییر نام کاربری به نصب فایل dashboard_upgrade.sql نیاز دارد.":e.message||"ذخیره ناموفق بود.";}).finally(function(){accountSave.disabled=false;});
  });
  var accountRecovery=document.getElementById("accountRecovery");
  if(accountRecovery)accountRecovery.addEventListener("click",function(){
    var email=myBucket().profile.email;if(!email)return;
    accountRecovery.disabled=true;var status=document.getElementById("accountStatus");
    window.IntMedBackend.resetPassword(email).then(function(){status.textContent="درخواست لینک تنظیم رمز به ایمیل فعلی حساب ارسال شد.";}).catch(function(){status.textContent="ارسال درخواست ناموفق بود.";}).finally(function(){accountRecovery.disabled=false;});
  });
  if(ticketSendBtn){
    ticketSendBtn.addEventListener("click", function(){
      var msg = ticketMessageEl.value.trim();
      if(!msg) return;
      if(!STATE.tickets) STATE.tickets = [];
      STATE.tickets.push({
        id: "t" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        userId: CURRENT_USER_ID,
        userName: USER_NAMES[CURRENT_USER_ID] || CURRENT_USER_ID,
        message: msg,
        createdAt: new Date().toISOString(),
        read: false
      });
      ticketMessageEl.value = "";
      scheduleFlush(300);
      renderTicketHistory();
    });
  }
  if(adminTabUsers){
    adminTabUsers.addEventListener("click", function(){
      adminTabUsers.classList.add("active");
      adminTabTickets.classList.remove("active");
      adminUsersPanel.style.display = "";
      adminTicketsPanel.style.display = "none";
    });
    adminTabTickets.addEventListener("click", function(){
      adminTabTickets.classList.add("active");
      adminTabUsers.classList.remove("active");
      adminTicketsPanel.style.display = "";
      adminUsersPanel.style.display = "none";
    });
  }

  function renderTicketHistory(){
    var root = document.getElementById("ticketHistoryList");
    if(!root) return;
    var mine = (STATE.tickets || []).filter(function(t){ return t.userId === CURRENT_USER_ID; }).slice().reverse();
    if(!mine.length){ root.innerHTML = ""; return; }
    root.innerHTML = '<div class="ticket-history-label">پیام‌های قبلی شما</div>' + mine.map(function(t){
      // An admin-initiated message has no message from the user at all —
      // show it as a standalone message FROM the admin, not as "your own
      // message" with a reply nested under it.
      if(t.fromAdmin){
        return '<div class="ticket-history-item">' +
          '<div class="ticket-history-reply"><b>پیام از مدیر — ' + formatFaDateTime(t.createdAt) + '</b>' + escapeHtml(t.message) + '</div>' +
          '</div>';
      }
      return '<div class="ticket-history-item"><div class="ticket-history-msg">' + escapeHtml(t.message) + '</div>' +
        '<div class="ticket-history-meta">' + formatFaDateTime(t.createdAt) + (t.read ? " · دیده‌شده توسط مدیر" : "") + '</div>' +
        (t.reply ? '<div class="ticket-history-reply"><b>پاسخ مدیر' + (t.replyAt ? " — " + formatFaDateTime(t.replyAt) : "") + '</b>' + escapeHtml(t.reply) + '</div>' : "") +
        '</div>';
    }).join("");
  }

  // Which admin-user accordion rows are currently expanded, keyed by userId —
  // kept outside renderAdminUsers() so re-rendering on every search keystroke
  // doesn't collapse a card the admin just opened.
  var adminUsersOpenIds = {};
  function renderAdminUsers(){
    if(!adminUsersPanel) return;
    var ids = usesPrivateBackend()
      ? Object.keys(STATE.users || {}).filter(function(id){ return id !== CURRENT_USER_ID; })
      : Object.keys(USER_NAMES).filter(function(id){ return id !== "amir"; });
    var approvedSignupById = {};
    (STATE.signups || []).forEach(function(s){
      if(s.status === "approved" && s.userId){
        approvedSignupById[s.userId] = s;
        if(ids.indexOf(s.userId) === -1) ids.push(s.userId);
      }
    });
    var query = normalizeDigits((adminUserSearchEl && adminUserSearchEl.value) || "").toLowerCase().trim();
    var rows = ids.map(function(id){
      var bucket = STATE.users[id] || {};
      var p = bucket.profile || {};
      var log = bucket.loginLog || [];
      var displayName = USER_NAMES[id] || p.fullName || (approvedSignupById[id] && approvedSignupById[id].fullName) || bucket.backendUsername || id;
      // Static accounts (amir/arash/alisalehi) have their password hash
      // hardcoded in GATE_USERS in this file's own source — nothing in
      // STATE can change how they log in, so the password-change action
      // only makes sense for accounts that came through the signup/approve
      // flow, whose live passwordHash lives in STATE.users[id].
      var isStatic = !usesPrivateBackend() && USER_NAMES.hasOwnProperty(id);
      // The login hash is keyed by whatever username the person actually
      // typed at signup (s.username), not the derived/slugified userId —
      // need this exact string to compute a matching hash for a password
      // change.
      var loginUsername = bucket.backendUsername || (approvedSignupById[id] && approvedSignupById[id].username) || id;
      return {id:id, p:p, log:log, displayName:displayName, isStatic:isStatic, loginUsername:loginUsername, role:bucket.backendRole,approved:bucket.backendApproved,rejected:bucket.backendRejected,canDelete:usesPrivateBackend() && id!==CURRENT_USER_ID && bucket.backendRole!=="admin"};
    });
    var filter=document.getElementById("adminUserStatusFilter");
    if(filter && filter.value!=="all")rows=rows.filter(function(r){return filter.value==='admin'?r.role==='admin':filter.value==='active'?r.approved&&!r.rejected:filter.value==='suspended'?r.rejected:!r.approved&&!r.rejected;});
    if(query){
      rows = rows.filter(function(r){
        var haystack = [r.displayName, r.loginUsername, r.id, r.p.idNumber, r.p.phone, r.p.email, r.p.degree, r.p.specialty, r.p.province]
          .map(function(v){ return normalizeDigits(v || "").toLowerCase(); }).join(" ");
        return haystack.indexOf(query) !== -1;
      });
    }
    var html = rows.map(function(r){
      var count = r.log.length;
      var last = count ? formatFaDateTime(r.log[r.log.length - 1].at) : "هنوز وارد نشده";
      var recent = r.log.slice(-5).reverse().map(function(l){ return formatFaDateTime(l.at); }).join("، ") || "—";
      var isOpen = !!adminUsersOpenIds[r.id];
      return '<div class="admin-user-card' + (isOpen ? " open" : "") + '" data-user-row="' + escapeHtml(r.id) + '">' +
        '<div class="admin-user-head" data-user-toggle="' + escapeHtml(r.id) + '">' +
          '<div class="admin-user-head-left"><span class="admin-user-name">' + escapeHtml(r.displayName) + '</span></div>' +
          '<div class="admin-user-head-right"><span class="account-state">'+(r.role==='admin'?'مدیر':r.approved?'فعال':r.rejected?'معلق':'منتظر تأیید')+'</span><span>' + faDigits(count) + ' ورود</span><span class="admin-user-chev">▾</span></div>' +
        '</div>' +
        '<div class="admin-user-body"><div class="admin-user-body-inner">' +
          '<div class="admin-user-row"><span>نام کاربری:</span><b>' + escapeHtml(r.loginUsername) + '</b></div>' +
          '<div class="admin-user-row"><span>تعداد ورود:</span><b>' + faDigits(count) + '</b></div>' +
          '<div class="admin-user-row"><span>آخرین ورود:</span><b>' + last + '</b></div>' +
          '<div class="admin-user-row admin-user-recent"><span>۵ ورود اخیر:</span><b>' + recent + '</b></div>' +
          (r.canDelete ? '<div class="admin-account-actions">'+
            '<button type="button" data-account-approval="'+escapeHtml(r.id)+'" data-approved="'+String(r.approved===true)+'">'+(r.approved?'تعلیق دسترسی':'تأیید / فعال‌سازی')+'</button>'+
            '<button type="button" data-account-recovery="'+escapeHtml(r.id)+'">ارسال لینک بازیابی</button><span role="status" id="accountAction-'+escapeHtml(r.id)+'"></span></div>' : '') +
          '<div class="admin-user-analytics" data-user-analytics="'+escapeHtml(r.id)+'"></div>'+
          '<div class="admin-user-edit-box">' +
            '<div class="profile-grid">' + PROFILE_FIELDS.map(function(f){
              return '<div class="profile-field"><label for="adminEdit-' + r.id + '-' + f.key + '">' + f.label + '</label>' +
                '<input type="' + f.type + '" id="adminEdit-' + r.id + '-' + f.key + '" value="' + escapeHtml(r.p[f.key] || "") + '"'+(f.key==='email'?' readonly':'')+'></div>';
            }).join("") +
            '</div>' +
            '<button type="button" class="profile-save-btn admin-user-save-btn" data-save-profile="' + escapeHtml(r.id) + '">ذخیره تغییرات پروفایل</button>' +
            '<span class="admin-user-save-note" id="saveNote-' + escapeHtml(r.id) + '"></span>' +
          '</div>' +
          '<div class="admin-user-pass-box">' +
            (usesPrivateBackend()
              ? '<p class="admin-user-pass-static">بازیابی و تغییر رمز از مسیر امن ایمیل Supabase انجام می‌شود؛ مدیر به رمز فعلی یا جدید دسترسی ندارد.</p>'
              : r.isStatic
              ? '<p class="admin-user-pass-static">رمز این حساب ایستا و داخل کد سایت است — تغییرش یک ویرایش کد لازم دارد، در گفتگو با کلود بخواه.</p>'
              : ('<label for="passBox-' + escapeHtml(r.id) + '">تنظیم رمز عبور جدید برای این کاربر:</label>' +
                 '<input type="text" id="passBox-' + escapeHtml(r.id) + '" placeholder="رمز جدید را بنویس...">' +
                 '<button type="button" class="admin-user-pass-send" data-set-pass="' + escapeHtml(r.id) + '" data-set-pass-username="' + escapeHtml(r.loginUsername) + '">ثبت رمز جدید</button>' +
                 '<span class="admin-user-pass-note" id="passNote-' + escapeHtml(r.id) + '"></span>' +
                 '<p class="admin-user-pass-hint">رمز فعلی هیچ‌جا ذخیره نمی‌شه (حتی برای خودِ مدیر) — فقط می‌تونی رمز جدید تنظیم کنی، نه رمز قبلی رو ببینی.</p>')) +
          '</div>' +
          (r.canDelete ? '<div class="admin-user-delete-box">' +
            '<button type="button" class="admin-user-delete-btn" data-delete-user="' + escapeHtml(r.id) + '" data-delete-name="' + escapeHtml(r.displayName) + '">حذف کاربر از IntMed</button>' +
            '<span role="status" class="admin-user-delete-note" id="deleteNote-' + escapeHtml(r.id) + '"></span></div>' : '') +
          '<div class="admin-user-msg-box">' +
            '<label for="msgBox-' + escapeHtml(r.id) + '">ارسال پیام به ' + escapeHtml(r.displayName) + ':</label>' +
            '<textarea id="msgBox-' + escapeHtml(r.id) + '" placeholder="پیامت رو اینجا بنویس..."></textarea>' +
            '<button type="button" class="admin-user-msg-send" data-send-msg="' + escapeHtml(r.id) + '" data-send-msg-name="' + escapeHtml(r.displayName) + '">ارسال پیام</button>' +
            '<span class="admin-user-msg-note" id="msgNote-' + escapeHtml(r.id) + '"></span>' +
          '</div>' +
        '</div></div>' +
      '</div>';
    }).join("");
    adminUsersPanel.innerHTML = html || '<p class="learn-empty">' + (query ? "کاربری با این مشخصات پیدا نشد." : "هنوز کاربری ثبت نشده.") + '</p>';
    adminUsersPanel.querySelectorAll("[data-user-toggle]").forEach(function(head){
      head.addEventListener("click", function(){
        var id = head.getAttribute("data-user-toggle");
        var card = head.closest(".admin-user-card");
        var nowOpen = !card.classList.contains("open");
        adminUsersOpenIds[id] = nowOpen;
        card.classList.toggle("open", nowOpen);
      });
    });
    adminUsersPanel.querySelectorAll("[data-delete-user]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id=btn.getAttribute("data-delete-user"),name=btn.getAttribute("data-delete-name");
        if(!confirm("آیا از حذف کاربر «"+name+"» از IntMed مطمئن هستید؟\nپروفایل، پیشرفت مطالعه، یادداشت‌ها، هایلایت‌ها و پیام‌های او حذف می‌شوند. این کار قابل بازگشت نیست.")) return;
        var note=document.getElementById("deleteNote-"+id);
        btn.disabled=true;btn.textContent="در حال حذف…";
        // Finish in-flight writes before removal so this tab cannot restore data.
        waitForPendingWrites().then(function(){return window.IntMedBackend.deleteUser(id);}).then(function(){
          delete STATE.users[id];delete adminUsersOpenIds[id];
          STATE.tickets=(STATE.tickets||[]).filter(function(t){return t.userId!==id;});
          STATE.signups=(STATE.signups||[]).filter(function(s){return (s.userId||s.id)!==id;});
          renderUserPanel();
        }).catch(function(error){
          btn.disabled=false;btn.textContent="حذف کاربر از IntMed";
          if(note) note.textContent=error.message||"حذف انجام نشد؛ دوباره تلاش کنید.";
        });
      });
    });
    adminUsersPanel.querySelectorAll("[data-account-approval]").forEach(function(button){button.addEventListener("click",function(){
      var id=button.dataset.accountApproval,approved=button.dataset.approved==="true";
      if(approved && !confirm("دسترسی این کاربر تعلیق شود؟ یادداشت‌ها و اطلاعات مطالعهٔ او حذف نمی‌شوند."))return;
      button.disabled=true;var status=document.getElementById("accountAction-"+id);
      window.IntMedBackend.approveUser(id,!approved).then(function(){STATE.users[id].backendApproved=!approved;STATE.users[id].backendRejected=approved;STATE.signups=(STATE.signups||[]).filter(function(s){return (s.userId||s.id)!==id;});renderUserPanel();}).catch(function(e){status.textContent=e.message||"عملیات ناموفق بود.";button.disabled=false;});
    });});
    adminUsersPanel.querySelectorAll("[data-account-recovery]").forEach(function(button){button.addEventListener("click",function(){
      var id=button.dataset.accountRecovery,email=(STATE.users[id].profile||{}).email;if(!email)return;
      if(!confirm("لینک بازیابی رمز به ایمیل ثبت‌شدهٔ این کاربر ارسال شود؟"))return;
      button.disabled=true;var status=document.getElementById("accountAction-"+id);
      window.IntMedBackend.resetPassword(email).then(function(){status.textContent="درخواست ارسال شد.";}).catch(function(){status.textContent="ارسال ناموفق بود.";}).finally(function(){button.disabled=false;});
    });});
    renderStudyDashboard();
    // Admin edits basic profile fields; verified Auth email stays protected.
    adminUsersPanel.querySelectorAll("[data-save-profile]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-save-profile");
        if(!STATE.users[id]) STATE.users[id] = emptyBucket();
        var p = STATE.users[id].profile || {};
        PROFILE_FIELDS.forEach(function(f){
          var input = document.getElementById("adminEdit-" + id + "-" + f.key);
          if(input && f.key!=="email") p[f.key] = input.value.trim();
        });
        p.updatedAt = new Date().toISOString();
        STATE.users[id].profile = p;
        scheduleFlush(200);
        syncProfileToSheet(id, p);
        var note = document.getElementById("saveNote-" + id);
        if(note) note.textContent = "ذخیره شد ✓";
        adminUsersOpenIds[id] = true; // keep this card open through the re-render
        setTimeout(renderAdminUsers, 900);
      });
    });
    // Sets a brand-new password hash — never reads or stores the old
    // plaintext password anywhere, including here. The hash is keyed by the
    // same (username, password) pair the login form hashes, so it has to
    // use the original signup username (data-set-pass-username), not the
    // derived userId.
    adminUsersPanel.querySelectorAll("[data-set-pass]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-set-pass");
        var username = btn.getAttribute("data-set-pass-username");
        var input = document.getElementById("passBox-" + id);
        var note = document.getElementById("passNote-" + id);
        var newPass = input ? normalizeDigits(input.value) : "";
        if(!newPass){
          if(note) note.textContent = "اول رمز جدید رو بنویس.";
          return;
        }
        if(!STATE.users[id]) STATE.users[id] = emptyBucket();
        var newHash = fnv1aHex(username + ":" + newPass);
        STATE.users[id].passwordHash = newHash;
        // Also update the original signup record's hash — the dynamic
        // login check falls back to it for approved signups predating this
        // field, and leaving it stale would let the OLD password keep
        // working forever alongside the new one. Caught via testing.
        var signupRecord = (STATE.signups || []).find(function(s){ return s.userId === id; });
        if(signupRecord) signupRecord.hash = newHash;
        scheduleFlush(200);
        if(input) input.value = "";
        if(note) note.textContent = "رمز جدید ثبت شد ✓";
      });
    });
    adminUsersPanel.querySelectorAll("[data-send-msg]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-send-msg");
        var name = btn.getAttribute("data-send-msg-name");
        var textarea = document.getElementById("msgBox-" + id);
        var note = document.getElementById("msgNote-" + id);
        var msg = textarea ? textarea.value.trim() : "";
        if(!msg){
          if(note) note.textContent = "اول پیام رو بنویس.";
          return;
        }
        if(!STATE.tickets) STATE.tickets = [];
        STATE.tickets.push({
          id: "t" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          userId: id, userName: name, message: msg, fromAdmin: true,
          createdAt: new Date().toISOString(), read: true
        });
        scheduleFlush(200);
        if(textarea) textarea.value = "";
        if(note) note.textContent = "ارسال شد ✓ — در تب «پیام‌ها و تیکت‌ها» هم ثبت شد.";
        renderAdminTickets();
      });
    });
  }
  if(adminUserSearchEl){
    adminUserSearchEl.addEventListener("input", function(){ renderAdminUsers(); });
  }

  function renderAdminTickets(){
    if(!adminTicketsPanel) return;
    var list = (STATE.tickets || []).slice().reverse();
    var unreadCount = list.filter(function(t){ return !t.read; }).length;
    if(adminTicketBadge){
      if(unreadCount){ adminTicketBadge.textContent = faDigits(unreadCount); adminTicketBadge.style.display = ""; }
      else { adminTicketBadge.style.display = "none"; }
    }
    if(!list.length){ adminTicketsPanel.innerHTML = '<p class="learn-empty">پیامی ثبت نشده.</p>'; return; }
    adminTicketsPanel.innerHTML = list.map(function(t){
      // Admin-initiated outbound messages (sent from the per-user "ارسال
      // پیام" box) are a read-only record here — there's nothing to mark
      // read or reply to, it's just proof the send actually went through.
      if(t.fromAdmin){
        return '<div class="admin-ticket-item sent" data-ticket-id="' + escapeHtml(t.id) + '">' +
          '<div class="admin-ticket-from">شما → ' + escapeHtml(t.userName || t.userId) + '</div>' +
          '<div class="admin-ticket-msg">' + escapeHtml(t.message) + '</div>' +
          '<div class="admin-ticket-meta"><span>' + formatFaDateTime(t.createdAt) + '</span></div>' +
          '</div>';
      }
      return '<div class="admin-ticket-item' + (t.read ? "" : " unread") + '" data-ticket-id="' + escapeHtml(t.id) + '">' +
        '<div class="admin-ticket-from">' + escapeHtml(t.userName || t.userId) + '</div>' +
        '<div class="admin-ticket-msg">' + escapeHtml(t.message) + '</div>' +
        '<div class="admin-ticket-meta"><span>' + formatFaDateTime(t.createdAt) + '</span>' +
        (t.read ? "" : '<button type="button" class="admin-ticket-mark-btn" data-mark-read="' + escapeHtml(t.id) + '">دیده شد</button>') +
        '</div>' +
        '<div class="admin-ticket-reply-box">' +
          '<label for="replyBox-' + escapeHtml(t.id) + '">' + (t.reply ? "ویرایش پاسخ:" : "پاسخ به این پیام:") + '</label>' +
          '<textarea id="replyBox-' + escapeHtml(t.id) + '" placeholder="پاسخت رو اینجا بنویس...">' + escapeHtml(t.reply || "") + '</textarea>' +
          '<button type="button" class="admin-ticket-reply-send" data-reply-ticket="' + escapeHtml(t.id) + '">ارسال پاسخ</button>' +
          '<span class="admin-ticket-reply-note" id="replyNote-' + escapeHtml(t.id) + '"></span>' +
        '</div>' +
        '</div>';
    }).join("");
    adminTicketsPanel.querySelectorAll("[data-mark-read]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-mark-read");
        var t = (STATE.tickets || []).find(function(x){ return x.id === id; });
        if(t){ t.read = true; scheduleFlush(200); renderAdminTickets(); }
      });
    });
    // Sending a reply used to just silently re-render — if the typed text
    // matched what was already there (e.g. re-sending, or the admin can't
    // tell at a glance that the textarea's content is now "saved" rather
    // than "still just typed"), it could look exactly like nothing
    // happened. Same for an empty textarea, which used to no-op with zero
    // feedback. Both now show a note next to the button either way.
    adminTicketsPanel.querySelectorAll("[data-reply-ticket]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-reply-ticket");
        var t = (STATE.tickets || []).find(function(x){ return x.id === id; });
        if(!t) return;
        var textarea = document.getElementById("replyBox-" + id);
        var note = document.getElementById("replyNote-" + id);
        var reply = textarea ? textarea.value.trim() : "";
        if(!reply){
          if(note){ note.textContent = "اول پاسخ رو بنویس."; note.classList.add("warn"); }
          return;
        }
        t.reply = reply;
        t.replyAt = new Date().toISOString();
        t.read = true;
        scheduleFlush(200);
        if(note){ note.classList.remove("warn"); note.textContent = "ارسال شد ✓"; }
        // Delay the re-render so the "ارسال شد ✓" note is actually visible
        // for a moment — renderAdminTickets() replaces this whole box's
        // markup (including this note), so firing it immediately would
        // wipe the confirmation in the same tick, which is exactly the
        // "I clicked and nothing seemed to happen" symptom this is fixing.
        setTimeout(renderAdminTickets, 900);
      });
    });
  }

  // Known, taken userIds — the static accounts plus every signup already
  // approved — used to keep a newly-approved signup's derived id from
  // colliding with an existing one.
  function knownUserIds(){
    var ids = Object.keys(USER_NAMES).slice();
    (STATE.signups || []).forEach(function(s){
      if(s.status === "approved" && s.userId && ids.indexOf(s.userId) === -1) ids.push(s.userId);
    });
    return ids;
  }
  function deriveUserId(username){
    var base = normalizeDigits(username).toLowerCase().replace(/[^a-z0-9]/g, "") || ("u" + Date.now());
    var taken = knownUserIds();
    var candidate = base, n = 2;
    while(taken.indexOf(candidate) !== -1){ candidate = base + n; n++; }
    return candidate;
  }

  function renderAdminSignups(){
    var root = document.getElementById("adminSignupsList");
    if(!root) return;
    var pending = (STATE.signups || []).filter(function(s){ return s.status === "pending"; }).slice().reverse();
    if(!pending.length){ root.innerHTML = ""; return; }
    root.innerHTML = pending.map(function(s){
      return '<div class="admin-signup-pending" data-signup-id="' + escapeHtml(s.id) + '">' +
        '<div class="admin-signup-pending-icon">⚠</div>' +
        '<div class="admin-signup-pending-body">' +
          '<b>درخواست ثبت‌نام: ' + escapeHtml(s.fullName || s.username) + '</b>' +
          'نام کاربری: ' + escapeHtml(s.username) + ' — مدرک: ' + (escapeHtml(s.degree) || '—') +
          ' — رشته: ' + (escapeHtml(s.specialty) || '—') + ' — استان: ' + (escapeHtml(s.province) || '—') +
          ' — کد نظام/دانشجویی: ' + (escapeHtml(s.idNumber) || '—') + '<br>' +
          'موبایل: ' + escapeHtml(s.mobile || '—') + ' — ایمیل: ' + (escapeHtml(s.email) || '—') +
          '<br>' + formatFaDateTime(s.createdAt) +
        '</div>' +
        '<div class="admin-signup-pending-actions">' +
          '<button type="button" class="admin-signup-approve-btn" data-approve-signup="' + escapeHtml(s.id) + '">تایید</button>' +
          '<button type="button" class="admin-signup-reject-btn" data-reject-signup="' + escapeHtml(s.id) + '">رد</button>' +
        '</div>' +
      '</div>';
    }).join("");
    root.querySelectorAll("[data-approve-signup]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-approve-signup");
        var s = (STATE.signups || []).find(function(x){ return x.id === id; });
        if(!s) return;
        if(usesPrivateBackend()){
          window.IntMedBackend.approveUser(s.userId || s.id, true).then(function(){
            s.status = "approved";
            renderAdminSignups();
          }).catch(function(){ alert("تأیید حساب ناموفق بود."); });
          return;
        }
        var userId = deriveUserId(s.username);
        s.status = "approved";
        s.userId = userId;
        s.decidedAt = new Date().toISOString();
        STATE.users[userId] = emptyBucket();
        STATE.users[userId].profile = {
          fullName: s.fullName || "", degree: s.degree || "", idNumber: s.idNumber || "",
          phone: s.mobile || "", email: s.email || "",
          updatedAt: new Date().toISOString()
        };
        // Live, changeable copy of the login hash — see the "تغییر رمز
        // عبور" admin action below, and the dynamic-login-check in the
        // login-gate IIFE which checks this field first.
        STATE.users[userId].passwordHash = s.hash;
        scheduleFlush(200);
        renderAdminSignups();
        renderAdminUsers();
      });
    });
    root.querySelectorAll("[data-reject-signup]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id = btn.getAttribute("data-reject-signup");
        var s = (STATE.signups || []).find(function(x){ return x.id === id; });
        if(!s) return;
        if(!confirm("درخواست ثبت‌نام «" + (s.fullName || s.username) + "» رد بشه؟")) return;
        if(usesPrivateBackend()){
          window.IntMedBackend.approveUser(s.userId || s.id, false).then(function(){
            s.status = "rejected";
            renderAdminSignups();
          }).catch(function(){ alert("رد حساب ناموفق بود."); });
          return;
        }
        s.status = "rejected";
        s.decidedAt = new Date().toISOString();
        scheduleFlush(200);
        renderAdminSignups();
      });
    });
  }

  var adminAddSignupToggle = document.getElementById("adminAddSignupToggle");
  var adminSignupForm = document.getElementById("adminSignupForm");
  if(adminAddSignupToggle){
    adminAddSignupToggle.addEventListener("click", function(){
      var open = adminSignupForm.style.display !== "none";
      adminSignupForm.style.display = open ? "none" : "";
      adminAddSignupToggle.textContent = open ? "+ افزودن درخواست ثبت‌نام" : "− بستن فرم";
    });
  }
  var adminSignupSubmit = document.getElementById("adminSignupSubmit");
  if(adminSignupSubmit){
    // Admin-direct entry is approved immediately, not staged as "pending" —
    // unlike the public عضویت form (an anonymous, unverified self-report
    // relayed over WhatsApp/copy), the admin typing this in themselves *is*
    // the verification step, so a second "تایید" click was pure friction
    // and, if forgotten, left the person stuck unable to log in with no
    // visible row anywhere in "کاربران" (which only lists approved
    // signups). Per explicit user request 2026-10-05: approve on first
    // submission here. renderAdminSignups()/the pending approve-reject UI
    // stays in place for any signup that is somehow ever queued pending
    // (defensive only — nothing currently creates one in that state).
    adminSignupSubmit.addEventListener("click", function(){
      var username = normalizeDigits(document.getElementById("adminSignupUser").value).toLowerCase().trim();
      var password = normalizeDigits(document.getElementById("adminSignupPass").value);
      var fullName = document.getElementById("adminSignupFullName").value.trim();
      var degree = document.getElementById("adminSignupDegree").value.trim();
      var idNumber = document.getElementById("adminSignupIdNumber").value.trim();
      var mobile = normalizeDigits(document.getElementById("adminSignupMobile").value).trim();
      var email = document.getElementById("adminSignupEmail").value.trim();
      if(!username || !password || !fullName){ alert("نام کاربری، رمز عبور و نام الزامی‌اند."); return; }
      if(!STATE.signups) STATE.signups = [];
      var userId = deriveUserId(username);
      var nowIso = new Date().toISOString();
      STATE.signups.push({
        id: "su" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        username: username, hash: fnv1aHex(username + ":" + password),
        fullName: fullName, degree: degree, idNumber: idNumber, mobile: mobile, email: email,
        status: "approved", userId: userId, createdAt: nowIso, decidedAt: nowIso
      });
      STATE.users[userId] = emptyBucket();
      STATE.users[userId].profile = {
        fullName: fullName, degree: degree, idNumber: idNumber,
        phone: mobile, email: email, updatedAt: nowIso
      };
      STATE.users[userId].passwordHash = fnv1aHex(username + ":" + password);
      ["adminSignupUser","adminSignupPass","adminSignupFullName","adminSignupDegree","adminSignupIdNumber","adminSignupMobile","adminSignupEmail"].forEach(function(id){
        document.getElementById(id).value = "";
      });
      adminSignupForm.style.display = "none";
      adminAddSignupToggle.textContent = "+ افزودن درخواست ثبت‌نام";
      scheduleFlush(200);
      renderFavoriteStats();
      renderAdminSignups();
      renderAdminUsers();
      alert("کاربر «" + fullName + "» ساخته شد و همین الان می‌تواند با همین نام کاربری/رمز وارد شود.");
    });
  }

  function renderUserPanel(){
    var isAdmin = usesPrivateBackend() ? myBucket().backendRole === "admin" : CURRENT_USER_ID === "amir";
    renderStudyDashboard();
    var profileCard = document.getElementById("userProfileCard");
    var adminCard = document.getElementById("adminPanelCard");
    if(profileCard) profileCard.style.display = "";
    if(isAdmin)renderMyProfileFields();
    if(profileCard){var ownTicket=profileCard.querySelector('.ticket-box');if(ownTicket)ownTicket.style.display=isAdmin?'none':'';}
    if(adminCard) adminCard.style.display = isAdmin ? "" : "none";
    if(isAdmin){
      if(usesPrivateBackend()){
        if(adminAddSignupToggle) adminAddSignupToggle.style.display = "none";
        if(adminSignupForm) adminSignupForm.style.display = "none";
      }
      renderFavoriteStats();
      renderAdminSignups();
      renderAdminUsers();
      renderAdminTickets();
    } else {
      renderMyProfileFields();
      renderTicketHistory();
    }
  }

  var ghModal = document.getElementById("ghModal");
  var ghPatInput = document.getElementById("ghPatInput");
  var ghModalErr = document.getElementById("ghModalErr");
  var ghConnectBtn = document.getElementById("ghConnectBtn");
  var ghPatDisconnectBtn = document.getElementById("ghPatDisconnect");

  function updateGhBtn(){
    if(usesPrivateBackend() || !legacySyncAllowed()){
      ghModal.style.display = "none";
      ghConnectBtn.style.display = "none";
      return;
    }
    ghConnectBtn.style.display = "";
    ghConnectBtn.textContent = getPat() ? "⚙ تنظیمات همگام‌سازی" : "اتصال برای ذخیره‌سازی";
  }
  ghConnectBtn.addEventListener("click", function(){
    if(usesPrivateBackend() || !legacySyncAllowed()) return;
    ghModalErr.textContent = "";
    ghPatInput.value = "";
    ghPatDisconnectBtn.style.display = getPat() ? "" : "none";
    var adminInstr = document.getElementById("ghAdminInstructions");
    if(adminInstr) adminInstr.style.display = (CURRENT_USER_ID === "amir") ? "" : "none";
    ghModal.style.display = "flex";
  });
  var connectReminderBtn = document.getElementById("connectReminderBtn");
  if(connectReminderBtn) connectReminderBtn.addEventListener("click", function(){
    if(usesPrivateBackend()){
      if(!window.IntMedBackend.session() || document.getElementById("connStatus").textContent.indexOf("نشست") !== -1){ location.reload(); return; }
      if(dirty || flushing){ doFlush(); } else { connectGithub(); }
      return;
    }
    ghConnectBtn.click();
  });
  window.addEventListener("online", function(){
    if(!usesPrivateBackend() || !hasPersistenceCredentials()) return;
    if(dirty || flushing){ doFlush(); } else { connectGithub(); }
  });
  document.getElementById("ghPatCancel").addEventListener("click", function(){ ghModal.style.display = "none"; });
  document.getElementById("ghPatSave").addEventListener("click", function(){
    if(usesPrivateBackend() || !legacySyncAllowed()) return;
    var v = ghPatInput.value.trim();
    if(!v){ ghModalErr.textContent = "توکن را وارد کن."; return; }
    setPat(v);
    ghModal.style.display = "none";
    updateGhBtn();
    connectGithub();
  });
  ghPatDisconnectBtn.addEventListener("click", function(){
    if(!confirm("اتصال این دستگاه قطع بشه؟ (داده‌ها ذخیره‌شده می‌مونن، فقط این دستگاه دیگه باهاشون همگام نمی‌شه)")) return;
    setPat("");
    ghModal.style.display = "none";
    setConn("nopat");
    updateGhBtn();
  });

  function loadSingleTopic(topicId){
    if(topicLoadPromises[topicId]) return topicLoadPromises[topicId];
    if(contentMap[topicId]) return Promise.resolve(contentMap[topicId]);
    var metadata = contentManifest.topics && contentManifest.topics[topicId];
    if(!metadata) return Promise.reject(new Error("missing topic metadata"));
    topicLoadPromises[topicId] = fetch(metadata.path + "?v=" + metadata.sha256).then(function(response){
      if(!response.ok) throw new Error("http " + response.status);
      return response.json();
    }).then(function(payload){
      contentMap[topicId] = payload;updateLearnCounts(topicId);updateContentBadge(topicId);return payload;
    }).catch(function(error){delete topicLoadPromises[topicId];throw error;});
    return topicLoadPromises[topicId];
  }
  function ensureTopicLoaded(topicId){
    return loadSingleTopic(topicId).then(function(payload){
      var dependencies = [];
      ["mcq","kfPmp"].forEach(function(field){
        (payload[field] || []).forEach(function(item){
          [item].concat(item.steps || []).forEach(function(part){
            var ref=part.imageRef;
            if(ref && ref.topicId !== topicId && dependencies.indexOf(ref.topicId) === -1) dependencies.push(ref.topicId);
          });
        });
      });
      return Promise.all(dependencies.map(loadSingleTopic)).then(function(){return payload;});
    });
  }

  (function init(){
    Promise.all([
      fetch("content/taxonomy.json").then(function(r){ if(!r.ok) throw new Error("taxonomy " + r.status); return r.json(); }),
      fetch("content/manifest.json").then(function(r){ if(!r.ok) throw new Error("manifest " + r.status); return r.json(); })
    ]).then(function(results){
      TOPICS = (results[0].categories || []).map(function(category){
        return {id:category.id, color:category.color, label:category.label, subs:category.topics || []};
      });
      contentManifest = results[1] || {topics:{}};
      buildTopicsUI();
      allTopicIds.forEach(function(id){
        updateLearnCounts(id);
        updateContentBadge(id);
      });
      TOPICS.forEach(updateCatContentBadge);
      updateGhBtn();
      renderUserPanel();
      if(hasPersistenceCredentials()){ connectGithub(); } else { setConn("nopat"); }
      refreshAll();
    }).catch(function(){
      document.getElementById("topicsRoot").innerHTML = '<div class="learn-empty">بارگذاری فهرست مباحث ناموفق بود. صفحه را دوباره بارگذاری کنید.</div>';
      setConn("error");
    });
  })();

  // ---------------------------------------------------------------
  // Learn panels (flashcards / mcq / KF&PMP / images / tables)
  // ---------------------------------------------------------------
  function updateLearnCounts(topicId){
    var data = contentMap[topicId] || {};
    var counts = (contentManifest.topics && contentManifest.topics[topicId] && contentManifest.topics[topicId].counts) || {};
    LEARN_TYPES.forEach(function(lt){
      var n = lt.key === "highlights" ? (myBucket().highlights[topicId] || []).length
        : data[lt.key] ? data[lt.key].length : (counts[lt.key] || 0);
      var el = document.querySelector('[data-lc="'+topicId+'-'+lt.key+'"]');
      if(el) el.textContent = n ? faDigits(n) : "";
    });
  }

  function parseMdTable(md){
    var lines = String(md||"").trim().split("\n").filter(function(l){ return l.trim(); });
    if(lines.length < 2) return null;
    var rows = lines.filter(function(l, i){ return i !== 1; }).map(function(l){
      return l.trim().replace(/^\||\|$/g, "").split("|").map(function(c){ return c.trim(); });
    });
    return rows;
  }

  // ---------------------------------------------------------------
  // Highlights / notes (lesson prose, flashcard backs, table cells).
  // Anchored by (topicId, locKey, quote, occurrence) — a stable id where
  // one exists (flashcard id), otherwise a position key (section/row/col
  // index). If the underlying content text changes later, an orphaned
  // highlight just silently stops re-attaching on render — it still
  // exists in storage (visible via "هایلایت‌های من"), it just won't
  // show as a <mark> anymore.
  // ---------------------------------------------------------------
  function getHighlights(topicId){ return myBucket().highlights[topicId] || []; }
  function ensureHighlightsArr(topicId){
    var hl = myBucket().highlights;
    if(!hl[topicId]) hl[topicId] = [];
    return hl[topicId];
  }
  function makeHlId(){ return "h" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

  function nthIndexOf(fullText, quote, n){
    var idx = -1;
    for(var i=0;i<=n;i++){
      idx = fullText.indexOf(quote, idx+1);
      if(idx === -1) return -1;
    }
    return idx;
  }
  function countOccurrencesBefore(fullText, quote, beforeIndex){
    var count = 0, idx = fullText.indexOf(quote);
    while(idx !== -1 && idx < beforeIndex){ count++; idx = fullText.indexOf(quote, idx+1); }
    return count;
  }

  function buildHighlightedFragment(fullText, list){
    var ranges = [], i;
    for(i=0;i<list.length;i++){
      var h = list[i];
      var start = nthIndexOf(fullText, h.quote, h.occurrence || 0);
      if(start === -1) continue; // anchor lost (source text changed since this highlight was made)
      ranges.push({start:start, end:start + h.quote.length, h:h});
    }
    ranges.sort(function(a,b){ return a.start - b.start; });
    var clean = [], lastEnd = -1;
    for(i=0;i<ranges.length;i++){
      if(ranges[i].start >= lastEnd){ clean.push(ranges[i]); lastEnd = ranges[i].end; }
    }
    var frag = document.createDocumentFragment();
    var cursor = 0;
    clean.forEach(function(r){
      if(r.start > cursor) frag.appendChild(document.createTextNode(fullText.slice(cursor, r.start)));
      var mark = document.createElement("mark");
      mark.className = "hl hl-" + (r.h.color || "yellow") + (r.h.note ? " hl-noted" : "");
      mark.textContent = fullText.slice(r.start, r.end);
      mark.dataset.hlId = r.h.id;
      if(r.h.note) mark.title = r.h.note;
      frag.appendChild(mark);
      cursor = r.end;
    });
    if(cursor < fullText.length) frag.appendChild(document.createTextNode(fullText.slice(cursor)));
    return frag;
  }

  function applyHighlightsToContainer(container, topicId, locKey){
    var fullText = container.dataset.hlRawText;
    if(fullText == null) return;
    var aliases = (container.dataset.hlAliases || "").split("|").filter(Boolean);
    var migrated = false;
    var list = getHighlights(topicId).filter(function(h){
      if(h.loc === locKey) return true;
      if(aliases.indexOf(h.loc) !== -1){ h.loc = locKey; migrated = true; return true; }
      return false;
    });
    if(migrated) scheduleFlush(500);
    container.innerHTML = "";
    if(!list.length){ container.appendChild(document.createTextNode(fullText)); return; }
    container.appendChild(buildHighlightedFragment(fullText, list));
  }

  function offsetWithinContainer(container, targetNode, targetOffset){
    var offset = 0, found = false;
    function walk(node){
      if(found) return;
      if(node.nodeType === 3){
        if(node === targetNode){ offset += targetOffset; found = true; return; }
        offset += node.textContent.length;
      } else {
        for(var i=0;i<node.childNodes.length;i++){ walk(node.childNodes[i]); if(found) return; }
      }
    }
    walk(container);
    return offset;
  }

  function refreshHighlightsListIfOpen(topicId){
    var t = topicEls[topicId];
    if(!t) return;
    updateLearnCounts(topicId);
    if(t.openType === "highlights") renderLearnPanel(topicId, "highlights");
  }

  function commitHighlight(sel, color, note){
    var list = ensureHighlightsArr(sel.topicId);
    list.push({
      id: makeHlId(),
      loc: sel.locKey,
      quote: sel.quote,
      occurrence: sel.occurrence,
      color: color,
      note: note || "",
      createdAt: new Date().toISOString()
    });
    applyHighlightsToContainer(sel.container, sel.topicId, sel.locKey);
    scheduleFlush(400);
    refreshHighlightsListIfOpen(sel.topicId);
  }

  // --- selection -> floating toolbar ---
  var hlToolbar = document.createElement("div");
  hlToolbar.className = "hl-toolbar";
  hlToolbar.innerHTML =
    '<button type="button" class="hl-swatch hl-yellow" data-color="yellow" title="زرد"></button>' +
    '<button type="button" class="hl-swatch hl-green" data-color="green" title="سبز"></button>' +
    '<button type="button" class="hl-swatch hl-pink" data-color="pink" title="صورتی"></button>' +
    '<button type="button" class="hl-swatch hl-blue" data-color="blue" title="آبی"></button>' +
    '<button type="button" class="hl-swatch hl-purple" data-color="purple" title="بنفش"></button>' +
    '<button type="button" class="hl-swatch hl-orange" data-color="orange" title="نارنجی"></button>' +
    '<button type="button" class="hl-note-btn" id="hlNoteBtn">+ یادداشت</button>';
  document.body.appendChild(hlToolbar);

  var pendingSelection = null;
  function hideToolbar(){ hlToolbar.style.display = "none"; pendingSelection = null; }

  function findAnnotatable(node){
    while(node && node.nodeType !== 1) node = node.parentNode;
    if(!node || !node.closest) return null;
    return node.closest("[data-hl-loc]");
  }

  document.addEventListener("selectionchange", function(){
    clearTimeout(window.__hlSelTimer);
    window.__hlSelTimer = setTimeout(function(){
      var sel = window.getSelection();
      if(!sel || sel.isCollapsed || sel.rangeCount === 0){ hideToolbar(); return; }
      var c1 = findAnnotatable(sel.anchorNode);
      var c2 = findAnnotatable(sel.focusNode);
      if(!c1 || c1 !== c2){ hideToolbar(); return; }
      var range = sel.getRangeAt(0);
      var fullText = c1.dataset.hlRawText || "";
      var startOff = offsetWithinContainer(c1, range.startContainer, range.startOffset);
      var endOff = offsetWithinContainer(c1, range.endContainer, range.endOffset);
      if(startOff > endOff){ var tmp = startOff; startOff = endOff; endOff = tmp; }
      var quote = fullText.slice(startOff, endOff);
      if(!quote || !quote.trim()){ hideToolbar(); return; }
      pendingSelection = {
        container: c1,
        topicId: c1.dataset.hlTopic,
        locKey: c1.dataset.hlLoc,
        quote: quote,
        occurrence: countOccurrencesBefore(fullText, quote, startOff)
      };
      var rect = range.getBoundingClientRect();
      hlToolbar.style.left = Math.max(4, rect.left + window.scrollX) + "px";
      hlToolbar.style.top = Math.max(4, rect.top + window.scrollY - 38) + "px";
      hlToolbar.style.display = "flex";
    }, 180);
  });

  hlToolbar.querySelectorAll(".hl-swatch").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!pendingSelection) return;
      commitHighlight(pendingSelection, btn.dataset.color, null);
      hideToolbar();
      window.getSelection().removeAllRanges();
    });
  });
  document.getElementById("hlNoteBtn").addEventListener("click", function(){
    if(!pendingSelection) return;
    var noteText = prompt("یادداشت برای این بخش:", "");
    if(noteText === null) return;
    commitHighlight(pendingSelection, "yellow", noteText);
    hideToolbar();
    window.getSelection().removeAllRanges();
  });

  // --- click existing <mark> -> view/edit/delete popover ---
  var hlPopover = document.createElement("div");
  hlPopover.className = "hl-popover";
  hlPopover.innerHTML =
    '<div class="hl-popover-note" id="hlPopoverNote"></div>' +
    '<div class="hl-popover-actions">' +
      '<button type="button" id="hlPopoverEdit">ویرایش یادداشت</button>' +
      '<button type="button" id="hlPopoverDelete">حذف هایلایت</button>' +
      '<button type="button" id="hlPopoverClose">بستن</button>' +
    '</div>';
  document.body.appendChild(hlPopover);
  var popoverCtx = null;
  function closeHlPopover(){ hlPopover.style.display = "none"; popoverCtx = null; }
  function openHlPopover(mark, topicId, locKey, h, container){
    popoverCtx = {topicId:topicId, locKey:locKey, hlId:h.id, container:container};
    document.getElementById("hlPopoverNote").textContent = h.note ? h.note : "(بدون یادداشت — فقط هایلایت)";
    var rect = mark.getBoundingClientRect();
    hlPopover.style.left = Math.max(4, rect.left + window.scrollX) + "px";
    hlPopover.style.top = (rect.bottom + window.scrollY + 6) + "px";
    hlPopover.style.display = "block";
  }
  function findHl(topicId, hlId){
    var list = getHighlights(topicId);
    for(var i=0;i<list.length;i++){ if(list[i].id === hlId) return list[i]; }
    return null;
  }
  document.getElementById("hlPopoverClose").addEventListener("click", closeHlPopover);
  document.getElementById("hlPopoverEdit").addEventListener("click", function(){
    if(!popoverCtx) return;
    var h = findHl(popoverCtx.topicId, popoverCtx.hlId);
    if(!h) return;
    var v = prompt("یادداشت:", h.note || "");
    if(v === null) return;
    h.note = v;
    applyHighlightsToContainer(popoverCtx.container, popoverCtx.topicId, popoverCtx.locKey);
    scheduleFlush(400);
    refreshHighlightsListIfOpen(popoverCtx.topicId);
    closeHlPopover();
  });
  document.getElementById("hlPopoverDelete").addEventListener("click", function(){
    if(!popoverCtx) return;
    if(!confirm("این هایلایت حذف بشه؟")) return;
    var list = getHighlights(popoverCtx.topicId);
    for(var i=0;i<list.length;i++){
      if(list[i].id === popoverCtx.hlId){ list.splice(i,1); break; }
    }
    applyHighlightsToContainer(popoverCtx.container, popoverCtx.topicId, popoverCtx.locKey);
    scheduleFlush(400);
    refreshHighlightsListIfOpen(popoverCtx.topicId);
    closeHlPopover();
  });
  document.addEventListener("click", function(e){
    if(hlPopover.contains(e.target)) return;
    var mark = e.target.closest ? e.target.closest("mark.hl") : null;
    if(mark){
      var container = mark.closest("[data-hl-loc]");
      if(!container) return;
      var topicId = container.dataset.hlTopic, locKey = container.dataset.hlLoc;
      var h = findHl(topicId, mark.dataset.hlId);
      if(h) openHlPopover(mark, topicId, locKey, h, container);
      return;
    }
    if(!hlToolbar.contains(e.target)) closeHlPopover();
  });

  var imageTabUrls = new WeakMap();
  function getImageTabUrl(img){
    var source = img.sourceUrl || "";
    if(source.indexOf("data:") !== 0) return source;
    var cached = imageTabUrls.get(img);
    if(cached) return cached;
    var comma = source.indexOf(",");
    var mime = source.slice(5, comma).split(";")[0];
    var binary = atob(source.slice(comma + 1));
    var bytes = new Uint8Array(binary.length);
    for(var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], {type:mime}));
    imageTabUrls.set(img, url);
    return url;
  }
  function appendQuestionFigure(container, item){
    var ref = item.imageRef;
    if(!ref) return;
    var sourceTopic = contentMap[ref.topicId] || {};
    var img = (sourceTopic.images || []).find(function(candidate){ return candidate.id === ref.imageId; });
    if(!img || !img.sourceUrl) return;
    var figure = document.createElement("figure");
    figure.className = "img-row question-figure";
    var link = document.createElement("a");
    link.href = getImageTabUrl(img); link.target = "_blank"; link.rel = "noopener";
    link.title = "باز کردن تصویر در تب جدید";
    var image = document.createElement("img");
    image.className = "img-inline"; image.src = img.sourceUrl;
    image.alt = item.imageAlt || "تصویر همراه سؤال"; image.loading = "lazy";
    link.appendChild(image); figure.appendChild(link);
    var caption = document.createElement("figcaption");
    caption.className = "cap-note";
    caption.textContent = "برای بزرگ‌نمایی روی تصویر بزنید. منبع: Harrison’s Principles of Internal Medicine, 22nd Edition — Copyright © McGraw Hill.";
    figure.appendChild(caption); container.appendChild(figure);
  }

  function renderLearnPanel(topicId, type){
    var t = topicEls[topicId];
    if(!t) return;
    var data = type === "highlights" ? getHighlights(topicId) : ((contentMap[topicId] || {})[type] || []);
    var panel = t.learnPanel;

    if(!data.length){
      panel.innerHTML = type === "highlights"
        ? '<div class="learn-empty">هنوز هایلایت یا یادداشتی برای این مبحث نساختی. متن رو در درسنامه/فلش‌کارت/جدول انتخاب کن تا دکمهٔ هایلایت ظاهر بشه.</div>'
        : '<div class="learn-empty">هنوز محتوایی برای این بخش ساخته نشده. در گفتگو با کلود بگو کجا منبعش رو پیدا کنه یا بساز.</div>';
      return;
    }

    if(type === "highlights"){
      panel.innerHTML = "";
      data.slice().reverse().forEach(function(h){
        var row = document.createElement("div");
        row.className = "hl-list-item hl-list-" + (h.color || "yellow");
        var src = h.loc.indexOf("lesson:") === 0 ? "درسنامه"
          : (h.loc.indexOf("fc:") === 0 || h.loc.indexOf("fc-front:") === 0) ? "فلش‌کارت"
          : h.loc.indexOf("mcq:") === 0 ? "تست"
          : h.loc.indexOf("kf:") === 0 ? "KF & PMP"
          : "جدول";
        var quote = document.createElement("div");
        quote.className = "hl-list-quote";
        quote.textContent = "«" + h.quote + "»";
        var meta = document.createElement("div");
        meta.className = "hl-list-meta";
        meta.textContent = src + (h.note ? " · " + h.note : "");
        var del = document.createElement("button");
        del.type = "button"; del.className = "hl-list-del"; del.textContent = "حذف";
        del.addEventListener("click", function(){
          if(!confirm("این هایلایت حذف بشه؟")) return;
          var arr = getHighlights(topicId);
          for(var i=0;i<arr.length;i++){ if(arr[i].id === h.id){ arr.splice(i,1); break; } }
          scheduleFlush(400);
          renderLearnPanel(topicId, "highlights");
          updateLearnCounts(topicId);
        });
        row.appendChild(quote); row.appendChild(meta); row.appendChild(del);
        panel.appendChild(row);
      });
      return;
    }

    if(type === "lesson"){
      panel.innerHTML = "";
      data.forEach(function(sec, secIdx){
        if(sec.groupHeader){
          var gwrap = document.createElement("div");
          gwrap.className = "lesson-group-header";
          var gh = document.createElement("div");
          gh.className = "lesson-group-heading";
          gh.textContent = sec.heading;
          gwrap.appendChild(gh);
          if(sec.embedNote){
            var gnote = document.createElement("div");
            gnote.className = "lesson-group-note";
            gnote.textContent = sec.embedNote;
            gwrap.appendChild(gnote);
          }
          panel.appendChild(gwrap);
          return;
        }
        var wrap = document.createElement("div");
        wrap.className = "lesson-section";
        var h = document.createElement("div");
        h.className = "lesson-heading";
        h.textContent = sec.heading;
        wrap.appendChild(h);
        if(sec.embedPath){
          if(sec.embedNote){
            var note = document.createElement("div");
            note.className = "lesson-embed-note";
            note.textContent = sec.embedNote;
            wrap.appendChild(note);
          }
          var iframe = document.createElement("iframe");
          iframe.className = "lesson-embed-frame";
          iframe.src = sec.embedPath;
          iframe.loading = "lazy";
          wrap.appendChild(iframe);
        } else {
          var body = document.createElement("div");
          body.className = "lesson-body";
          var paragraphs = sec.paragraphs || String(sec.body || "").split(/\n\s*\n/).map(function(text, index){
            return {id:(sec.id || ("section-" + secIdx)) + "-p" + (index + 1), text:text};
          });
          paragraphs.forEach(function(para, paraIdx){
            var trimmed = String(para.text || "").trim();
            if(!trimmed) return;
            var p = document.createElement("p");
            var locKey = "lesson:" + (sec.id || secIdx) + ":" + (para.id || paraIdx);
            p.dataset.hlRawText = trimmed;
            p.dataset.hlLoc = locKey;
            p.dataset.hlAliases = para.legacyLoc || ("lesson:" + secIdx + ":" + paraIdx);
            p.dataset.hlTopic = topicId;
            applyHighlightsToContainer(p, topicId, locKey);
            body.appendChild(p);
          });
          wrap.appendChild(body);
        }
        panel.appendChild(wrap);
      });
      return;
    }

    if(type === "flashcards"){
      panel.innerHTML = "";
      data.forEach(function(fc, fcIdx){
        var card = document.createElement("div");
        card.className = "fc-card";
        var front = document.createElement("div");
        front.className = "fc-front";
        var fcFrontLocKey = "fc-front:" + (fc.id || fcIdx);
        front.dataset.hlRawText = fc.front;
        front.dataset.hlLoc = fcFrontLocKey;
        if(fc.legacyKey != null) front.dataset.hlAliases = "fc-front:" + fc.legacyKey;
        front.dataset.hlTopic = topicId;
        applyHighlightsToContainer(front, topicId, fcFrontLocKey);
        var backWrap = document.createElement("div");
        backWrap.className = "fc-back";
        backWrap.style.display = "none";
        var fcLocKey = "fc:" + (fc.id || fcIdx);
        backWrap.dataset.hlRawText = fc.back;
        backWrap.dataset.hlLoc = fcLocKey;
        if(fc.legacyKey != null) backWrap.dataset.hlAliases = "fc:" + fc.legacyKey;
        backWrap.dataset.hlTopic = topicId;
        applyHighlightsToContainer(backWrap, topicId, fcLocKey);
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "fc-reveal"; btn.textContent = "نمایش پاسخ";
        btn.addEventListener("click", function(){
          var showing = backWrap.style.display !== "none";
          backWrap.style.display = showing ? "none" : "block";
          btn.textContent = showing ? "نمایش پاسخ" : "مخفی کردن";
        });
        card.appendChild(front); card.appendChild(btn); card.appendChild(backWrap);
        panel.appendChild(card);
      });
      return;
    }

    if(type === "mcq"){
      panel.innerHTML = "";
      data.forEach(function(q, qIdx){
        var block = document.createElement("div");
        block.className = "mcq-block";
        var qKey = q.id || qIdx;
        var stem = document.createElement("div");
        stem.className = "mcq-stem";
        var stemLocKey = "mcq:" + qKey + ":stem";
        var numberedStem = "سوال " + faDigits(qIdx + 1) + ": " + q.stem;
        stem.dataset.hlRawText = numberedStem;
        stem.dataset.hlLoc = stemLocKey;
        if(q.legacyKey != null) stem.dataset.hlAliases = "mcq:" + q.legacyKey + ":stem";
        stem.dataset.hlTopic = topicId;
        applyHighlightsToContainer(stem, topicId, stemLocKey);
        block.appendChild(stem);
        appendQuestionFigure(block, q);
        var explain = document.createElement("div");
        explain.className = "mcq-explain";
        var explainLocKey = "mcq:" + qKey + ":explain";
        explain.dataset.hlRawText = q.explanation || q.explain || "";
        explain.dataset.hlLoc = explainLocKey;
        if(q.legacyKey != null) explain.dataset.hlAliases = "mcq:" + q.legacyKey + ":explain";
        explain.dataset.hlTopic = topicId;
        if(q.explanation || q.explain) applyHighlightsToContainer(explain, topicId, explainLocKey);
        (q.options||[]).forEach(function(opt, idx){
          var ob = document.createElement("button");
          ob.type = "button"; ob.className = "mcq-opt"; ob.textContent = opt;
          ob.addEventListener("click", function(){
            if(window.IntMedDashboard)window.IntMedDashboard.answer(topicId,qKey,idx===q.correctIndex);
            block.querySelectorAll(".mcq-opt").forEach(function(x){ x.disabled = true; });
            ob.classList.add(idx === q.correctIndex ? "correct" : "incorrect");
            if(idx !== q.correctIndex){
              var correctBtn = block.querySelectorAll(".mcq-opt")[q.correctIndex];
              if(correctBtn) correctBtn.classList.add("correct");
            }
            explain.classList.add("show");
          });
          block.appendChild(ob);
        });
        block.appendChild(explain);
        panel.appendChild(block);
      });
      return;
    }

    if(type === "kfPmp"){
      panel.innerHTML = "";
      data.forEach(function(kf, kfIdx){
        var kfKey = kf.id || kfIdx;
        var legacyKfKey = kf.legacyKey != null ? kf.legacyKey : kfKey;
        var block = document.createElement("div");
        block.className = "kfp-block";
        var title = document.createElement("div");
        title.className = "kfp-title"; title.textContent = kf.title;
        block.appendChild(title);
        if(kf.vignette){
          var vig = document.createElement("div");
          vig.className = "kfp-vignette"; vig.textContent = kf.vignette;
          var vigLocKey = "kf:" + kfKey + ":vignette";
          vig.dataset.hlRawText = kf.vignette;
          vig.dataset.hlLoc = vigLocKey;
          vig.dataset.hlTopic = topicId;
          applyHighlightsToContainer(vig, topicId, vigLocKey);
          block.appendChild(vig);
        }
        appendQuestionFigure(block, kf);
        (kf.steps||[]).forEach(function(step, i){
          var stepEl = document.createElement("div");
          stepEl.className = "kfp-step";
          var prompt = document.createElement("div");
          var promptText = (i+1) + ". " + step.prompt;
          prompt.className = "kfp-prompt"; prompt.textContent = promptText;
          var stepKey = step.id || ("step" + i);
          var promptLocKey = "kf:" + kfKey + ":" + stepKey + ":prompt";
          prompt.dataset.hlRawText = promptText;
          prompt.dataset.hlLoc = promptLocKey;
          var legacyStepIndex = step.legacyIndex != null ? step.legacyIndex : i;
          prompt.dataset.hlAliases = "kf:" + legacyKfKey + ":step" + legacyStepIndex + ":prompt";
          prompt.dataset.hlTopic = topicId;
          applyHighlightsToContainer(prompt, topicId, promptLocKey);
          var ans = document.createElement("div");
          ans.className = "kfp-answer"; ans.textContent = step.expectedAnswer;
          var ansLocKey = "kf:" + kfKey + ":" + stepKey + ":answer";
          ans.dataset.hlRawText = step.expectedAnswer;
          ans.dataset.hlLoc = ansLocKey;
          ans.dataset.hlAliases = "kf:" + legacyKfKey + ":step" + legacyStepIndex + ":answer";
          ans.dataset.hlTopic = topicId;
          applyHighlightsToContainer(ans, topicId, ansLocKey);
          var btn = document.createElement("button");
          btn.type = "button"; btn.className = "fc-reveal"; btn.textContent = "نمایش پاسخ";
          btn.addEventListener("click", function(){
            var showing = ans.classList.contains("show");
            ans.classList.toggle("show", !showing);
            btn.textContent = showing ? "نمایش پاسخ" : "مخفی کردن";
          });
          stepEl.appendChild(prompt); appendQuestionFigure(stepEl, step); stepEl.appendChild(btn); stepEl.appendChild(ans);
          block.appendChild(stepEl);
        });
        panel.appendChild(block);
      });
      return;
    }

    if(type === "ventSim"){
      panel.innerHTML = "";
      data.forEach(function(sc, scIdx){
        var card = document.createElement("div");
        card.className = "vent-card" + (scIdx === 0 ? " open" : "");

        var head = document.createElement("div");
        head.className = "vent-head";
        var headLeft = document.createElement("div");
        headLeft.className = "vent-head-left";
        var title = document.createElement("span");
        title.className = "vent-title"; title.textContent = sc.disease;
        headLeft.appendChild(title);
        if(sc.supportType){
          var badge = document.createElement("span");
          badge.className = "vent-badge"; badge.textContent = sc.supportType;
          headLeft.appendChild(badge);
        }
        var chev = document.createElement("span");
        chev.className = "vent-chev"; chev.textContent = "▾";
        head.appendChild(headLeft);
        head.appendChild(chev);
        head.addEventListener("click", function(){ card.classList.toggle("open"); });
        card.appendChild(head);

        var body = document.createElement("div");
        body.className = "vent-body";
        var inner = document.createElement("div");
        inner.className = "vent-body-inner";

        if(sc.riskFactors && sc.riskFactors.length){
          var rf = document.createElement("div");
          rf.className = "vent-risk";
          rf.textContent = "عوامل خطر/زمینه: " + sc.riskFactors.join("، ");
          inner.appendChild(rf);
        }
        if(sc.indicationNote){
          var ind = document.createElement("div");
          ind.className = "vent-indication"; ind.textContent = sc.indicationNote;
          inner.appendChild(ind);
        }

        var setTitle = document.createElement("div");
        setTitle.className = "vent-subtitle";
        setTitle.textContent = "مد و تنظیمات اولیه" + (sc.mode ? " — " + sc.mode : "");
        inner.appendChild(setTitle);

        var s = sc.initialSettings || {};
        var setGrid = document.createElement("div");
        setGrid.className = "vent-settings-grid";
        [["FiO2", s.FiO2], ["PEEP", s.PEEP], ["IPAP", s.ipap], ["EPAP", s.epap],
         ["حجم جاری (Vt)", s.tidalVolume], ["تعداد تنفس (RR)", s.respiratoryRate]].forEach(function(p){
          if(!p[1]) return;
          var item = document.createElement("div");
          item.className = "vent-setting-item";
          var lbl = document.createElement("span"); lbl.className = "vent-setting-label"; lbl.textContent = p[0];
          var val = document.createElement("span"); val.className = "vent-setting-value"; val.textContent = p[1];
          item.appendChild(lbl); item.appendChild(val);
          setGrid.appendChild(item);
        });
        if(setGrid.children.length) inner.appendChild(setGrid);

        if(s.other && s.other.length){
          var otherList = document.createElement("ul");
          otherList.className = "vent-other-list";
          s.other.forEach(function(o){ var li = document.createElement("li"); li.textContent = o; otherList.appendChild(li); });
          inner.appendChild(otherList);
        }

        if(sc.rationale){
          var rat = document.createElement("div");
          rat.className = "vent-rationale"; rat.textContent = sc.rationale;
          inner.appendChild(rat);
        }

        if(sc.exampleAbgVbg){
          var abg = sc.exampleAbgVbg;
          var abgTitle = document.createElement("div");
          abgTitle.className = "vent-subtitle"; abgTitle.textContent = "نمونهٔ ABG/VBG";
          inner.appendChild(abgTitle);
          var abgGrid = document.createElement("div");
          abgGrid.className = "vent-abg-grid";
          [["pH", abg.ph], ["PaCO2", abg.paco2], ["PaO2", abg.pao2], ["HCO3", abg.hco3]].forEach(function(p){
            if(!p[1]) return;
            var item = document.createElement("div");
            item.className = "vent-abg-item";
            var lbl = document.createElement("span"); lbl.className = "vent-abg-label"; lbl.textContent = p[0];
            var val = document.createElement("span"); val.className = "vent-abg-value"; val.textContent = p[1];
            item.appendChild(lbl); item.appendChild(val);
            abgGrid.appendChild(item);
          });
          if(abgGrid.children.length) inner.appendChild(abgGrid);
          if(abg.interpretation){
            var interp = document.createElement("div");
            interp.className = "vent-abg-interp"; interp.textContent = abg.interpretation;
            inner.appendChild(interp);
          }
        }

        if(sc.titrationSteps && sc.titrationSteps.length){
          var titTitle = document.createElement("div");
          titTitle.className = "vent-subtitle"; titTitle.textContent = "تیتراسیون بر اساس پاسخ بیمار";
          inner.appendChild(titTitle);
          sc.titrationSteps.forEach(function(step){
            var row = document.createElement("div");
            row.className = "vent-titration-row";
            var trig = document.createElement("span"); trig.className = "vent-trigger"; trig.textContent = "اگر: " + step.trigger;
            var act = document.createElement("span"); act.className = "vent-action"; act.textContent = "← " + step.action;
            row.appendChild(trig); row.appendChild(act);
            inner.appendChild(row);
          });
        }

        if(sc.pitfalls && sc.pitfalls.length){
          var pitTitle = document.createElement("div");
          pitTitle.className = "vent-subtitle vent-subtitle-warn"; pitTitle.textContent = "اشتباهات رایج";
          inner.appendChild(pitTitle);
          var pitList = document.createElement("ul");
          pitList.className = "vent-pitfall-list";
          sc.pitfalls.forEach(function(pf){ var li = document.createElement("li"); li.textContent = pf; pitList.appendChild(li); });
          inner.appendChild(pitList);
        }

        body.appendChild(inner);
        card.appendChild(body);
        panel.appendChild(card);
      });
      return;
    }

    if(type === "images"){
      panel.innerHTML = "";
      data.forEach(function(img){
        var row = document.createElement("div");
        row.className = "img-row";
        var imageUrl = getImageTabUrl(img);
        var cap = document.createElement("div");
        cap.className = "img-cap"; cap.textContent = "🖼 " + img.caption;
        row.appendChild(cap);
        var imgEl = document.createElement("img");
        imgEl.className = "img-inline"; imgEl.src = img.sourceUrl; imgEl.alt = img.caption;
        imgEl.loading = "lazy";
        var imageLink = document.createElement("a");
        imageLink.href = imageUrl || "#"; imageLink.target = "_blank"; imageLink.rel = "noopener";
        imageLink.title = "باز کردن تصویر در تب جدید";
        imageLink.appendChild(imgEl);
        row.appendChild(imageLink);
        if(img.note){
          var note = document.createElement("span");
          note.className = "cap-note"; note.textContent = img.note;
          row.appendChild(note);
        }
        panel.appendChild(row);
      });
      return;
    }

    if(type === "tables"){
      panel.innerHTML = "";
      data.forEach(function(tbl, tblIdx){
        var titleEl = document.createElement("div");
        titleEl.className = "tbl-title"; titleEl.textContent = tbl.title;
        panel.appendChild(titleEl);
        var rows = parseMdTable(tbl.markdown);
        if(rows){
          var table = document.createElement("table");
          table.className = "md-table";
          rows.forEach(function(cells, ri){
            var tr = document.createElement("tr");
            cells.forEach(function(cell, ci){
              var cellEl = document.createElement(ri === 0 ? "th" : "td");
              var rowKey = (tbl.rowIds && tbl.rowIds[ri]) || ("row-" + ri);
              var cellLocKey = "table:" + (tbl.id || tblIdx) + ":" + rowKey + ":" + ci;
              cellEl.dataset.hlRawText = cell;
              cellEl.dataset.hlLoc = cellLocKey;
              var legacyTableIndex = tbl.legacyIndex != null ? tbl.legacyIndex : tblIdx;
              var legacyRowIndex = tbl.legacyRowIndices && tbl.legacyRowIndices[ri] != null ? tbl.legacyRowIndices[ri] : ri;
              cellEl.dataset.hlAliases = "table:" + legacyTableIndex + ":" + legacyRowIndex + ":" + ci;
              cellEl.dataset.hlTopic = topicId;
              applyHighlightsToContainer(cellEl, topicId, cellLocKey);
              tr.appendChild(cellEl);
            });
            table.appendChild(tr);
          });
          panel.appendChild(table);
        }
      });
      return;
    }
  }

  var tabBtnDashboard = document.getElementById("tabBtnDashboard");
  var tabBtnEducation = document.getElementById("tabBtnEducation");
  var tabPanelDashboard = document.getElementById("tabPanelDashboard");
  var tabPanelEducation = document.getElementById("tabPanelEducation");
  function setTab(name){
    var isDash = name === "dashboard";
    if(isDash && window.IntMedDashboard)window.IntMedDashboard.stop();
    tabBtnDashboard.classList.toggle("active", isDash);
    tabBtnEducation.classList.toggle("active", !isDash);
    tabPanelDashboard.classList.toggle("active", isDash);
    tabPanelEducation.classList.toggle("active", !isDash);
  }
  tabBtnDashboard.addEventListener("click", function(){ setTab("dashboard"); });
  tabBtnEducation.addEventListener("click", function(){ setTab("education"); });

  if(window.IntMedDashboard)window.IntMedDashboard.init({
    state:function(){return STATE;},user:function(){return CURRENT_USER_ID;},topics:function(){return topicEls;},
    ready:function(){return stateLoaded;},goto:goToTopic,save:function(key,value){myBucket().itemState[key]=value;scheduleFlush(400);},
    flush:doFlush,wait:waitForPendingWrites
  });
  refreshAll();
})();
