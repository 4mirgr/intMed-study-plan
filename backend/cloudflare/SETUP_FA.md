# راه‌اندازی مسیر پایدار ورود با Cloudflare

این Worker برای اینترنت‌هایی است که به دامنهٔ `*.supabase.co` دسترسی ندارند.
هیچ رمز یا `service_role` در آن قرار نمی‌گیرد و فقط مسیرهای لازم همین پروژه را
به آدرس ثابت Supabase منتقل می‌کند.

فایل ریشهٔ `wrangler.jsonc` عمداً `main` را به همین Worker محدود می‌کند. در اتصال
Git، آن را حذف نکنید و `assets.directory` را روی `.` نگذارید؛ وگرنه Cloudflare کل
ریپو و `node_modules` را asset فرض می‌کند و deploy با خطای 25 MiB شکست می‌خورد.

## ساخت Worker

1. وارد [Cloudflare Dashboard](https://dash.cloudflare.com/) شوید.
2. از ستون چپ **Workers & Pages** را باز کنید.
3. **Create application** و سپس **Create Worker** را بزنید.
4. نام را `intmed-api-proxy` بگذارید و **Deploy** را بزنید.
5. **Edit code** را باز کنید، کل کد فایل `intmed-api-proxy.js` را جایگزین کنید و
   **Deploy** را بزنید. برای این Worker هیچ Secret یا Environment Variable لازم نیست.

## اتصال زیردامنه

1. در صفحهٔ Worker، **Settings → Domains & Routes** را باز کنید.
2. **Add → Custom Domain** را بزنید.
3. مقدار `api.drgerami-md.ir` را وارد و تأیید کنید.
4. Cloudflare رکورد DNS و گواهی HTTPS را می‌سازد. تا فعال‌شدن وضعیت دامنه صبر کنید.
5. این آدرس را باز کنید:
   `https://api.drgerami-md.ir/auth/v1/health`
   پاسخ `401` یا JSON سرویس نشان می‌دهد مسیر فعال است؛ خطای DNS یا صفحهٔ Cloudflare
   یعنی فعال‌سازی هنوز کامل نشده است.

## مسیر هم‌دامنه برای اینترنت همراه

دامنهٔ مستقیم Supabase و حتی زیردامنهٔ API ممکن است در بعضی اپراتورها هم‌زمان
فیلتر شوند. برای اینکه ورود از همان hostname سایت عبور کند، در همان Worker از
**Settings → Domains & Routes → Add → Route** این Routeها را اضافه کنید:

- `drgerami-md.ir/api/*`
- `www.drgerami-md.ir/api/*`

Zone باید در Cloudflare فعال و رکوردهای وب در حالت Proxied باشند. Worker پیشوند
`/api` را حذف و فقط مسیرهای مجاز Auth، REST و Functions همین پروژه را به Supabase
می‌فرستد؛ هیچ `service_role` یا secret مرورگر در آن وجود ندارد. پس از فعال‌سازی،
این آدرس باید پاسخ JSON سرویس بدهد:

`https://drgerami-md.ir/api/auth/v1/health`

پس از موفقیت این آزمایش، مقدار عمومی `supabaseUrl` سایت به
`https://api.drgerami-md.ir` تغییر می‌کند. کلید عمومی anon همان قبلی می‌ماند.
این تغییر را پیش از فعال‌شدن Worker انجام ندهید، چون ورود همهٔ شبکه‌ها قطع می‌شود.

برای Runner محلی، gateway فقط دانلود `GET/HEAD` لینک امضاشدهٔ bucket خصوصی
`intmed-content-inbox` را نیز عبور می‌دهد. هیچ مسیر Storage برای فهرست‌کردن، آپلود، جایگزینی یا
حذف باز نیست؛ بنابراین این استثنا را با `/storage/v1/` عمومی جایگزین نکنید.
