# چک‌لیست انتشار و سرویس‌های واقعی IntMed

این سند برای بررسی P0 است. هیچ token، رمز، کلید Resend یا service-role را در issue، چت، screenshot یا GitHub قرار ندهید.

## پیش‌بررسی قابل اجرا

بررسی محلی، بدون شبکه و بدون secret:

```bash
python3 scripts/release_preflight.py
python3 scripts/release_preflight_test.py
```

بررسی production فقط با token موقت موجود در shell؛ ابزار فقط **نام** secretها و تنظیم تابع را گزارش می‌کند و مقدار secret را چاپ نمی‌کند:

```bash
SUPABASE_ACCESS_TOKEN='...' python3 scripts/release_preflight.py --remote
```

خروجی قرمز یعنی انتشار ایمیل آماده نیست. نبود `RESEND_API_KEY` یا `NEWSLETTER_FROM` را با دورزدن تست حل نکنید.

## ایمیل تقویم و خبرنامه

1. یک subdomain فرستنده مانند `mail.example.ir` را در provider تأیید کنید؛ رکوردهای SPF و DKIM دقیقاً از provider گرفته شوند.
2. DMARC را ابتدا با `p=none` و گزارش‌گیری آغاز و بعد از مشاهدهٔ ارسال سالم به سیاست سخت‌تر ارتقا دهید.
3. در Supabase Edge Secrets فقط این نام‌ها را بسازید: `RESEND_API_KEY`، `NEWSLETTER_FROM` و `NEWSLETTER_SIGNING_SECRET` با حداقل ۳۲ نویسهٔ تصادفی.
4. `intmed-study-event` باید Verify JWT روشن داشته باشد. `intmed-newsletter` به‌علت لینک امضاشدهٔ لغو عضویت Verify JWT خاموش دارد، ولی عملیات مدیریتی را داخل handler دوباره احراز می‌کند.
5. با حساب مدیر، Status و سپس ارسال آزمایشی فقط به مدیر را اجرا کنید. header فرستنده، SPF/DKIM/DMARC، نمایش فارسی، فایل ICS، Google Calendar و لینک لغو عضویت را بررسی کنید.
6. برای خبرنامه از دو حساب آزمایشی مستقل استفاده کنید: یکی عضو و یکی لغوشده. تغییر ایمیل باید رضایت قبلی را بی‌اعتبار کند.
7. delivery ledger و Resend Logs را برای duplicate/uncertain/error بررسی کنید؛ ارسال نامطمئن را کورکورانه تکرار نکنید.

## Supabase Auth

- Site URL: دامنهٔ canonical با HTTPS و بدون مسیر اضافی.
- Redirect allow-list: دامنهٔ canonical، `www` در مدت مهاجرت و callbackهای دقیق recovery/invite. wildcard عمومی مجاز نیست.
- Confirm email روشن بماند؛ تأیید خودکار برنامه با تأیید ایمیل Auth اشتباه گرفته نشود.
- قالب Confirm signup، Reset password و Invite باید نام برند، دامنهٔ معتبر، زمان انقضا و هشدار «این لینک را برای دیگران نفرستید» داشته باشد.
- لینک قالب‌ها فقط از متغیرهای رسمی Supabase استفاده کند؛ password یا token در متن سفارشی log نشود.
- نرخ login/recovery/signup و CAPTCHA پس از مشاهدهٔ abuse فعال شود. خطاهای عمومی نباید وجود ایمیل را افشا کنند.
- URLهای قدیمی تا پایان مهاجرت redirect محدود و زمان‌دار داشته باشند. CORS و CSP فقط دامنه‌های واقعاً استفاده‌شده را بپذیرند.

## تست واقعی موبایل و شبکه

این ماتریس را روی حداقل یک Android Chrome و یک iPhone Safari، با Wi-Fi و دیتای همراه، یک بار بدون VPN و یک بار با VPN اجرا کنید:

- ثبت‌نام، دریافت تأیید، ورود username، logout، بازیابی و تعیین رمز جدید
- بستن کامل مرورگر روی دستگاه عمومی و اطمینان از باقی‌نماندن نشست
- رفتن برنامه به background و بازگشت پس از انقضای inactivity
- پنل حساب، پیام‌ها، badge، تقویم شمسی، Google Calendar و دانلود/بازکردن ICS
- opt-in/out خبرنامه و ارسال آزمایشی؛ بررسی spam و Persian RTL
- قطع شبکه وسط save و اطمینان از نبود duplicate یا از دست‌رفتن یادداشت
- حالت data saver، صفحهٔ باریک، فونت بزرگ، reduced motion و دستگاه کم‌توان

نتیجه باید با تاریخ شمسی، مدل دستگاه، نسخه OS/browser، اپراتور، VPN و screenshot بدون دادهٔ شخصی ثبت شود. شکست فقط روی یک اپراتور را «رمز اشتباه» گزارش نکنید؛ status شبکه/API را جدا بررسی کنید.

## دروازهٔ انتشار

انتشار کامل زمانی است که CI سبز، preflight production سبز، ارسال آزمایشی واقعی موفق، redirectها محدود، و smoke test موبایل ثبت شده باشد. تست خودکار جای تأیید DNS/provider و دستگاه واقعی را نمی‌گیرد.
