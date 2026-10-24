# راه‌اندازی صندوق محتوای تلگرام IntMed

این بات دو مسیر مستقل دارد: تابع فعلی `intmed-signup-notify` اعلان ثبت‌نام را می‌فرستد و
تابع `intmed-telegram-bot` متن، فایل، تصویر و پیام‌های Forwardشدهٔ مدیر را دریافت می‌کند. دریافت
به معنی انتشار نیست؛ همهٔ ورودی‌ها در وضعیت `pending_review` می‌مانند تا فرایند agentic و
بازبینی علمی اجرا شود. فایل‌ها علاوه بر رکورد صف در bucket خصوصی قرار می‌گیرند؛ متن فقط در جدول
service-only ذخیره می‌شود.

1. `telegram_ingest.sql` را در SQL Editor اجرا کنید. این migration یک bucket خصوصی ۲۰ مگابایتی و
   جدول service-only می‌سازد و به داده‌های کاربران دست نمی‌زند.
2. Edge Function با نام `intmed-telegram-bot` را از پوشه هم‌نام deploy کنید و gateway گزینه
   **Verify JWT را خاموش** کنید. تابع به‌جای JWT هدر secret رسمی webhook تلگرام را بررسی می‌کند.
3. secretهای `TELEGRAM_BOT_TOKEN` و `TELEGRAM_WEBHOOK_SECRET` را فقط در Edge Secrets قرار دهید.
   secret دوم باید تصادفی و طولانی باشد و در GitHub، مرورگر یا پیام‌ها نوشته نشود.
4. همان گفت‌وگوی خصوصی مدیر را ابتدا از رابط موجود `intmed-signup-notify` متصل کنید؛ بات فقط
   `chat_id` ثبت‌شده در `intmed_notification_settings` را می‌پذیرد.
5. پس از اتصال گفت‌وگو، در پنل مدیر روی دکمهٔ **«فعال‌سازی دریافت فایل و Forward»** بزنید.
   این دکمه webhook را از سمت Edge Function ثبت می‌کند و توکن یا secret را وارد مرورگر نمی‌کند.
   روش دستی زیر فقط راه‌حل پشتیبان برای عیب‌یابی است: webhook را از یک محیط امن با Bot API ثبت
   کنید و secret را در پارامتر `secret_token` بفرستید:

   `https://api.telegram.org/bot<TOKEN>/setWebhook`

   بدنه JSON باید `url` تابع Supabase، `secret_token` و `allowed_updates:["message"]` داشته باشد.
   توکن و secret را در shell history یا اسکرین‌شات ذخیره نکنید.
6. در چت `/start` و `/status` را آزمایش کنید، سپس یک PDF کوچک با caption زیر بفرستید:

   `/topic heme-lung-cancer`

7. یک متن، عکس یا فایل را از کاربر/گروه/کانال دیگری برای بات Forward کنید. نوع منبع، نام نمایشی،
   username عمومی، تاریخ اصلی و در صورت وجود شمارهٔ پیام نگه داشته می‌شود؛ شناسهٔ عددی شخص یا
   چت منبع ذخیره نمی‌شود و منبع Forwardشده هیچ سطح اعتمادی ایجاد نمی‌کند.
8. رکورد باید `pending_review` و object فایل باید در bucket خصوصی `intmed-content-inbox` باشد. ورودی تنها
   پس از اسکن/استخراج، تطبیق مبحث، کنترل تصویر، بازبینی علمی و تأیید مدیر وارد محتوای canonical شود.

کنترل‌های فعلی: secret ثابت‌زمان، chat allowlist، گفت‌وگوی خصوصی، سقف ۲۰MB، allowlist PDF/JPEG/PNG/WebP،
بررسی magic bytes مستقل از MIME ادعایی، سقف ۱۲ هزار نویسه برای متن، حداکثر ۱۲ ورودی در ده دقیقه،
update id یکتا، hash SHA-256، نام امن، جلوگیری از path traversal، bucket خصوصی و پیام خطای بدون افشای
secret. پیام عادی و Forwardشده هر دو قرنطینه می‌شوند و هیچ trigger انتشار خودکار وجود ندارد. تست محلی
هیچ تماس واقعی با تلگرام یا Supabase ندارد:

`node scripts/telegram_ingest_test.mjs`
