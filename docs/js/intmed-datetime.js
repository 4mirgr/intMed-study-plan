(function(global){
  'use strict';
  var TIME_ZONE='Asia/Tehran';
  var DAY=86400000;
  function latin(value){return String(value==null?'':value).replace(/[۰-۹]/g,function(d){return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}).replace(/[٠-٩]/g,function(d){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));});}
  function fa(value){return new Intl.NumberFormat('fa-IR',{useGrouping:false}).format(Number(value));}
  function faText(value){return String(value).replace(/\d/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'[Number(d)];});}
  function parts(date,calendar){
    var values={};
    new Intl.DateTimeFormat('en-CA-u-ca-'+(calendar||'gregory'),{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).forEach(function(part){if(part.type!=='literal')values[part.type]=Number(part.value);});
    return values;
  }
  function dayKey(value){
    var p=parts(new Date(value==null?Date.now():value),'gregory');
    return [p.year,String(p.month).padStart(2,'0'),String(p.day).padStart(2,'0')].join('-');
  }
  function formatDate(value,options){
    if(!value)return '';
    var d=/^\d{4}-\d{2}-\d{2}$/.test(String(value))?new Date(String(value)+'T12:00:00Z'):new Date(value);
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian',Object.assign({timeZone:TIME_ZONE,year:'numeric',month:'long',day:'numeric'},options||{})).format(d);
  }
  function formatDateTime(value){
    if(!value)return '';
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:TIME_ZONE,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  }
  function inputDate(value){
    if(!value)return '';
    var p=parts(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?new Date(String(value)+'T12:00:00Z'):new Date(value),'persian');
    return faText(p.year)+'/'+faText(String(p.month).padStart(2,'0'))+'/'+faText(String(p.day).padStart(2,'0'));
  }
  function comparePersian(p,target){
    var a=p.year*10000+p.month*100+p.day,b=target.year*10000+target.month*100+target.day;
    return a===b?0:(a<b?-1:1);
  }
  function parsePersianDate(value){
    var match=/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(latin(value).trim());
    if(!match)return null;
    var target={year:Number(match[1]),month:Number(match[2]),day:Number(match[3])};
    if(target.year<1300||target.year>1500||target.month<1||target.month>12||target.day<1||target.day>31)return null;
    var low=Math.floor(Date.UTC(target.year+620,0,1)/DAY),high=Math.floor(Date.UTC(target.year+623,0,1)/DAY);
    while(low<=high){
      var mid=Math.floor((low+high)/2),date=new Date(mid*DAY+12*3600000),p=parts(date,'persian'),cmp=comparePersian(p,target);
      if(cmp===0)return dayKey(date);
      if(cmp<0)low=mid+1;else high=mid-1;
    }
    return null;
  }
  function currentWeekKeys(value){
    var key=dayKey(value),anchor=new Date(key+'T12:00:00Z'),daysSinceSaturday=(anchor.getUTCDay()+1)%7,start=anchor.getTime()-daysSinceSaturday*DAY,result=[];
    for(var i=0;i<7;i++)result.push(dayKey(start+i*DAY));
    return result;
  }
  function zonedUtc(dateKey,time){
    var bits=(dateKey+'-'+time).match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})$/);if(!bits)return null;
    var guess=Date.UTC(+bits[1],+bits[2]-1,+bits[3],+bits[4],+bits[5]);
    for(var i=0;i<3;i++){
      var seen=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)),v={};
      seen.forEach(function(part){if(part.type!=='literal')v[part.type]=Number(part.value);});
      var represented=Date.UTC(v.year,v.month-1,v.day,v.hour,v.minute),wanted=Date.UTC(+bits[1],+bits[2]-1,+bits[3],+bits[4],+bits[5]);
      guess+=wanted-represented;
    }
    return new Date(guess);
  }
  function compact(date){return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
  function eventData(plan,title){
    var start=zonedUtc(plan.dueDate,plan.startTime||'09:00');if(!start)return null;
    var end=new Date(start.getTime()+Math.max(5,Number(plan.minutes)||30)*60000);
    return {title:title||'برنامه مطالعه',start:start,end:end,description:'برنامهٔ شخصی مطالعه در IntMed'};
  }
  function googleCalendarUrl(plan,title){
    var e=eventData(plan,title);if(!e)return '';
    var q=new URLSearchParams({action:'TEMPLATE',text:e.title,dates:compact(e.start)+'/'+compact(e.end),details:e.description,ctz:TIME_ZONE});
    return 'https://calendar.google.com/calendar/render?'+q.toString();
  }
  function ics(plan,title){
    var e=eventData(plan,title);if(!e)return '';
    function esc(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IntMed//Study Plan//FA','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+esc((plan.id||crypto.randomUUID())+'@intmed'),'DTSTAMP:'+compact(new Date()),'DTSTART:'+compact(e.start),'DTEND:'+compact(e.end),'SUMMARY:'+esc(e.title),'DESCRIPTION:'+esc(e.description),'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  }
  function downloadIcs(plan,title){
    var data=ics(plan,title);if(!data)return false;
    var url=URL.createObjectURL(new Blob([data],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='intmed-study.ics';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);return true;
  }
  global.IntMedDateTime={TIME_ZONE:TIME_ZONE,latin:latin,dayKey:dayKey,formatDate:formatDate,formatDateTime:formatDateTime,inputDate:inputDate,parsePersianDate:parsePersianDate,currentWeekKeys:currentWeekKeys,googleCalendarUrl:googleCalendarUrl,ics:ics,downloadIcs:downloadIcs};
})(window);
