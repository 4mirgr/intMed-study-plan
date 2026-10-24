# زیرساخت امن اشتراک و خرید

این بخش فقط foundation است و با نصب آن هیچ درس فعلی قفل نمی‌شود.

## نصب

1. `entitlements.sql` را در SQL Editor اجرا کنید.
2. Edge Function با نام `intmed-purchase-verify` را از فایل هم‌نام deploy کنید و Verify JWT را روشن نگه دارید.
3. برای هر فروشگاه یک verifier سروری قابل اعتماد و HTTPS تنظیم کنید:
   - `INTMED_BAZAAR_VERIFY_URL` و `INTMED_BAZAAR_VERIFY_SECRET`
   - `INTMED_MYKET_VERIFY_URL` و `INTMED_MYKET_VERIFY_SECRET`
4. محصول داخلی را ابتدا با `active=false` بسازید، نگاشت دقیق package/product فروشگاه را اضافه کنید و پس از تست sandbox آن‌ها را فعال کنید.

ورودی verifier باید `provider`, `packageName`, `productId`, `purchaseToken` را بگیرد و فقط پس از استعلام رسمی فروشگاه این قرارداد را برگرداند:

```json
{"valid":true,"state":"active","productId":"store.sku","orderId":"provider-order","startTime":"2026-10-24T00:00:00Z","expiryTime":"2026-11-24T00:00:00Z"}
```

کلاینت نمی‌تواند entitlement بسازد. Edge Function کاربر و محصول را دوباره بررسی، token را فقط به‌صورت SHA-256 ذخیره و RPC اتمیک service-role را فراخوانی می‌کند. پاسخ یا فلگ `valid` ارسالی از اپ نادیده گرفته می‌شود. نبود secret یا verifier همیشه به خطای بسته (fail-closed) منجر می‌شود.

قبل از فروش واقعی باید reconciliation دوره‌ای، webhook بازپرداخت/ابطال، تست sandbox هر فروشگاه، سیاست بازپرداخت و migration جداگانهٔ حفاظت محتوا تکمیل شود. فایل محتوای پولی نباید روی GitHub Pages عمومی باقی بماند.
