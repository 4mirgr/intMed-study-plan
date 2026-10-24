# مسیر دامنه، PWA و Android

## دامنه و ایمیل برند

1. دامنهٔ `.ir` را به نام مالک محصول در NIC ثبت و 2FA حساب‌های registrar/DNS را فعال کنید.
2. ابتدا DNS را بدون تغییر سایت آماده کنید. سپس دامنهٔ جدید را به Pages/CDN متصل و TLS را تا وضعیت معتبر صبر کنید.
3. دامنهٔ جدید را به CSP، CORS، Supabase Site URL/redirect allow-list و لینک‌های ایمیل اضافه کنید. دامنهٔ قدیمی در دورهٔ گذار فقط redirect کند.
4. برای ایمیل، subdomain مستقل ارسال و mailbox واقعی `support@…` بسازید. نشانی `noreply` بدون مسیر پشتیبانی مناسب نیست.
5. SPF فقط یک رکورد داشته باشد؛ DKIM و DMARC فعال و گزارش‌ها بررسی شوند. کلیدها در DNS/secret manager هستند، نه repository.

## ترتیب پیشنهادی PWA

PWA را قبل از wrapper اندروید پایدار کنید، ولی service worker را زودتر از تعریف cache policy منتشر نکنید. محتوای عمومی می‌تواند cache شود؛ پاسخ Auth، پیام‌ها، پروفایل، entitlement و فایل پولی هرگز وارد Cache Storage عمومی نشوند.

شرایط ورود به فاز PWA:

- manifest با نام/آیکون برند، `start_url` محدود و `display=standalone`
- service worker با versioned precache کم‌حجم و پاک‌سازی cache قدیمی
- offline screen صریح؛ نه نمایش دادهٔ خصوصی stale به کاربر بعدی
- update prompt و rollback برای service worker معیوب
- تست install/update/offline روی Android و iOS و Lighthouse budget

## Android با Capacitor

پس از تثبیت API/PWA، wrapper باریک بسازید؛ business logic و entitlement روی سرور باقی بماند.

- access/refresh token فقط در secure storage سیستم‌عامل؛ نه localStorage
- App/Universal Links برای login/recovery/calendar و allow-list دقیق hostها
- certificate pinning فقط همراه برنامهٔ rotation و recovery؛ pin ثابت بدون مسیر اضطراری خطرناک است
- push token مجزا از user identity، قابل ابطال در logout و حذف حساب
- flavor جدا برای Bazaar و Myket؛ receipt هر فروشگاه فقط server-side verify و idempotent شود
- WebView navigation allow-list، file access خاموش، debug build جدا و release signing key آفلاین/پشتیبان‌گیری‌شده
- privacy، شرایط استفاده، refund، حذف حساب و disclaimer آموزشی پزشکی پیش از submission

## انتقال بدون قطعی

1. دامنه/ایمیل جدید را در staging تأیید کنید.
2. کد را با پذیرش هم‌زمان old/new origin منتشر کنید.
3. Supabase redirect و provider sender را فعال و smoke test کنید.
4. canonical و لینک‌های ایمیل را به دامنه جدید تغییر دهید.
5. دامنه قدیمی را حداقل یک چرخهٔ معتبر session/email redirect نگه دارید.
6. پس از مشاهدهٔ لاگ سالم، old origin را از CORS/CSP حذف کنید.

قوانین پرداخت، کارمزد و الزام IAP بازار/مایکت ممکن است تغییر کند؛ در زمان submission فقط مستندات و قرارداد فعلی پنل رسمی ملاک است.
