# راه‌اندازی مسیر پایدار ورود با Cloudflare

این Worker برای اینترنت‌هایی است که به دامنهٔ `*.supabase.co` دسترسی ندارند.
هیچ رمز یا `service_role` در آن قرار نمی‌گیرد و فقط سه مسیر لازم همین پروژه را
به آدرس ثابت Supabase منتقل می‌کند.

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

پس از موفقیت این آزمایش، مقدار عمومی `supabaseUrl` سایت به
`https://api.drgerami-md.ir` تغییر می‌کند. کلید عمومی anon همان قبلی می‌ماند.
این تغییر را پیش از فعال‌شدن Worker انجام ندهید، چون ورود همهٔ شبکه‌ها قطع می‌شود.
