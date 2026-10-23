(function(global){
  "use strict";
  var degrees = ['دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص','سایر'];
  var provinces = ['آذربایجان شرقی','آذربایجان غربی','اردبیل','اصفهان','البرز','ایلام','بوشهر','تهران','چهارمحال و بختیاری','خراسان جنوبی','خراسان رضوی','خراسان شمالی','خوزستان','زنجان','سمنان','سیستان و بلوچستان','فارس','قزوین','قم','کردستان','کرمان','کرمانشاه','کهگیلویه و بویراحمد','گلستان','گیلان','لرستان','مازندران','مرکزی','هرمزگان','همدان','یزد'];
  var specialties = ['پزشکی عمومی','بیماری های داخلی','قلب و عروق','گوارش و کبد بزرگسالان','بیماری‌های کلیه (نفرولوژی)','غدد درون‌ریز و متابولیسم','بیماری‌های ریه','روماتولوژی','خون و سرطان بالغین (هماتولوژی و انکولوژی)','بیماری‌های عفونی و گرمسیری','آلرژی و ایمونولوژی بالینی','طب مراقبت‌های ویژه','طب تسکینی','طب سالمندی','کودکان','قلب کودکان','گوارش کودکان','کلیه کودکان','غدد کودکان','خون و سرطان کودکان','مغز و اعصاب کودکان','ریه کودکان','عفونی کودکان','روماتولوژی کودکان','طب نوزادی و پیرامون تولد','جراحی عمومی','جراحی قلب و عروق','جراحی قفسه سینه','جراحی عروق','جراحی کودکان','جراحی پلاستیک و ترمیمی','جراحی مغز و اعصاب','جراحی سرطان','جراحی کولورکتال','جراحی پستان','جراحی کبد، پانکراس و مجاری صفراوی','جراحی پیوند','جراحی لاپاروسکوپی','جراحی چاقی','ارتوپدی','جراحی دست','جراحی ستون فقرات','ارتوپدی کودکان','اورولوژی','اورولوژی کودکان','اندویورولوژی','زنان و زایمان','انکولوژی زنان','طب مادر و جنین (پریناتولوژی)','ناباروری و IVF','جراحی لگن و اوروژنیکولوژی','بیهوشی','طب درد','بیهوشی قلب','بیهوشی کودکان','طب اورژانس','مغز و اعصاب (نورولوژی)','صرع','سکته مغزی','اختلالات حرکت','بیماری‌های عصب و عضله','ام‌اس و نوروايمونولوژی','روان‌پزشکی','روان‌پزشکی کودک و نوجوان','روان‌پزشکی اعتیاد','روان‌تنی','پوست','چشم‌پزشکی','شبکیه','قرنیه','گلوکوم','استرابیسم','اکولوپلاستی','گوش و حلق و بینی و جراحی سر و گردن','اتولوژی و نورواتولوژی','رینولوژی','لارنگولوژی','رادیولوژی','رادیولوژی مداخله‌ای','نورورادیولوژی','رادیوانکولوژی (پرتودرمانی)','پزشکی هسته‌ای','آسیب‌شناسی (پاتولوژی)','هماتوپاتولوژی','سیتوپاتولوژی','پزشکی قانونی','طب فیزیکی و توان‌بخشی','پزشکی ورزشی','طب کار','پزشکی اجتماعی','پزشکی خانواده','طب پیشگیری','طب ایرانی','طب هوافضا','طب دریایی','ژنتیک پزشکی','ایمونولوژی پزشکی','میکروب‌شناسی پزشکی','ویروس‌شناسی پزشکی','انگل‌شناسی پزشکی','قارچ‌شناسی پزشکی','بیوشیمی بالینی','علوم آزمایشگاهی','اپیدمیولوژی','تغذیه بالینی','فارماکولوژی','فیزیولوژی پزشکی','علوم تشریحی','آموزش پزشکی','اخلاق پزشکی','سایر'];
  var aliases = {'بیماری های داخلی':'پزشکی داخلی داخلی internal medicine','قلب و عروق':'کاردیولوژی cardiology','رادیوانکولوژی (پرتودرمانی)':'رادیوانکو رادیو انکولوژی radiation oncology','زنان و زایمان':'زنان gynecology','جراحی عمومی':'جراحی surgery','مغز و اعصاب (نورولوژی)':'نورولوژی neurology'};
  function normalize(value){return value.normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200e\u200f\sـ-]+/g,'').toLowerCase();}
  function mount(scope){(scope||document).querySelectorAll('.search-select').forEach(function(root){
    if(root.dataset.mounted)return;root.dataset.mounted='true';
    var input=root.querySelector('input'),list=root.querySelector('[role=listbox]');
    var choices=root.dataset.options==='provinces'?provinces:specialties,filtered=[],active=-1;
    function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
    function check(){input.setCustomValidity(!input.value || choices.indexOf(input.value)!==-1?'':'یک گزینه از فهرست انتخاب کنید.');}
    function choose(value){input.value=value;check();close();input.dispatchEvent(new Event('change',{bubbles:true}));}
    function mark(){list.querySelectorAll('[role=option]').forEach(function(el,i){el.setAttribute('aria-selected',String(i===active));});if(active>=0){var el=list.children[active];input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}}
    function render(){
      var query=normalize(input.value);filtered=choices.filter(function(v){return normalize(v+' '+(aliases[v]||'')).includes(query);});active=-1;list.replaceChildren();
      filtered.forEach(function(v,i){var option=document.createElement('div');option.id=list.id+'-'+i;option.role='option';option.setAttribute('aria-selected','false');option.textContent=v;option.addEventListener('mousedown',function(e){e.preventDefault();});option.addEventListener('click',function(){choose(v);});list.appendChild(option);});
      if(!filtered.length){var empty=document.createElement('div');empty.className='empty-option';empty.textContent='گزینه‌ای پیدا نشد';list.appendChild(empty);}
      list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
    }
    input.addEventListener('focus',render);input.addEventListener('input',function(){check();render();});input.addEventListener('blur',function(){check();setTimeout(close,150);});
    input.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.preventDefault();close();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)render();if(filtered.length){active=(active+(e.key==='ArrowDown'?1:-1)+filtered.length)%filtered.length;mark();}}
      if(e.key==='Enter'&&!list.hidden){e.preventDefault();if(active>=0)choose(filtered[active]);else if(filtered.length===1)choose(filtered[0]);}
    });
  });
  }
  mount(document);
  global.IntMedRegistration={mount:mount,degrees:degrees,provinces:provinces,specialties:specialties,valid:function(degree,specialty,province){return degrees.includes(degree)&&(!specialty||specialties.includes(specialty))&&(!province||provinces.includes(province));}};
})(window);
