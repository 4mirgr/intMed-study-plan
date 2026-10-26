# راه‌اندازی Runner محلی IntMed با LM Studio

این Runner متن، PDF و تصویرهای صندوق خصوصی تلگرام را روی کامپیوتر مالک تحلیل می‌کند و فقط یک
**پیش‌نویس قابل بازبینی** به Supabase برمی‌گرداند. هیچ مطلبی را منتشر یا تأیید علمی نمی‌کند.

## پیش‌نیازها

- macOS، Python 3.11 یا جدیدتر و LM Studio
- فعال‌کردن Local Server در LM Studio فقط روی `127.0.0.1:1234`
- برای PDF یکی از این دو: `python3 -m pip install PyMuPDF` (پیشنهادی) یا `brew install poppler`
- تابع `intmed-local-runner` و migration مربوطه باید قبلاً روی Supabase نصب شده باشند.
- مقدار API پیش‌فرض `https://api.drgerami-md.ir` است تا مسیر امن فعلی سایت استفاده شود.

رم حساب فقط هنگام setup برای دریافت نشست استفاده می‌شود و ذخیره نمی‌شود. refresh token در
macOS Keychain با نام `ir.drgerami.intmed.local-runner` نگهداری می‌شود. Runner کلید عمومی
publishable/anon را به‌طور خودکار از `docs/config.js` می‌خواند؛ اگر اسکریپت بیرون از ریپو باشد آن را
از شما می‌پرسد. این کلید عمومی است. هرگز `service_role` را روی لپ‌تاپ قرار ندهید.

## انتخاب مدل برای رم ۸ گیگ

مدل‌ها را هم‌زمان load نکنید:

1. **Qwen3 4B Thinking 2507**: مدل اصلی و اجباری برای استخراج و ساخت JSON.
2. **Gemma E2B**: اختیاری برای vision و/یا روان‌سازی محدود فارسی.
3. **DeepSeek R1 Distill Qwen 7B**: اختیاری برای بازبینی هدفمند؛ به‌دلیل کندی می‌توانید در setup
   خالی بگذارید و بعداً فعال کنید.

نامی که در LM Studio دیده می‌شود الزاماً API ID نیست؛ setup فهرست واقعی `/v1/models` را نشان می‌دهد.

## نصب و اجرای نخست

از ریشهٔ ریپو:

```bash
python3 scripts/local_runner.py setup
python3 scripts/local_runner.py status
python3 scripts/local_runner.py once
```

برای کار مداوم:

```bash
python3 scripts/local_runner.py watch
```

Runner در حالت watch هر ۲۰ ثانیه صف را بررسی می‌کند. هنگام پردازش هر ۶۰ ثانیه heartbeat می‌فرستد؛
پس از سه heartbeat ناموفق خروجی را submit نمی‌کند تا یک کار دوبار ثبت نشود.

## رفتار ورودی‌ها

- متن: مستقیماً، اما به‌صورت چند قطعهٔ محدود تحلیل می‌شود.
- PDF: با `pdftotext` و حفظ `[PAGE n]` استخراج می‌شود؛ PDF اسکن‌شده نیازمند OCR است.
- تصویر: فقط وقتی `vision_model` در setup تعیین شده باشد.
- تمام ادعاها باید quote/page داشته باشند؛ نبود شاهد با `insufficientEvidence` ثبت می‌شود.
- Runner برای جا شدن در context چهار هزار، taxonomy را به حداکثر ۴۰ مبحث نزدیک و digest را به
  حدود ۹ هزار نویسه محدود می‌کند؛ اعتبار topic نهایی دوباره روی سرور با taxonomy کامل سنجیده می‌شود.
- ویراستار Gemma اجازهٔ تغییر عدد/دوز ندارد؛ Runner خروجی دارای تغییر عدد را رد می‌کند.
- DeepSeek فقط finding اضافه می‌کند و حق بازنویسی خودکار متن را ندارد.

## رفع اشکال

```bash
python3 scripts/local_runner.py models
python3 scripts/local_runner.py status
python3 -m unittest scripts/local_runner_test.py
```

- `connection refused`: Local Server در LM Studio روشن نیست یا پورت 1234 نیست.
- `Admin required`: حساب setup مدیر تأییدشدهٔ IntMed نیست.
- `vision_model_required`: مدل تصویر در setup انتخاب نشده است.
- `brew install poppler`: برای PDF لازم است و هزینه/API ندارد.
- برای تعویض مدل‌ها setup را دوباره اجرا کنید؛ آیتم‌های صف حذف نمی‌شوند.

پورت LM Studio را با tunnel، Port Forward یا bind روی `0.0.0.0` عمومی نکنید.
