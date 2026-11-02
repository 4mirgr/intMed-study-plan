# راهبرد کم‌هزینهٔ پردازش محتوای IntMed

آخرین بازبینی: ۱۴۰۵/۰۸/۱۱ (2026-11-02)

## تصمیم فعلی

- موتور اصلی: Gemini Flash-Lite با ورودی بومی PDF/تصویر و خروجی JSON.
- نام پیش‌فرض فعلی: `gemini-3.1-flash-lite`؛ مقدار قدیمی
  `gemini-2.5-flash` به‌صورت خودکار جایگزین می‌شود.
- مسیر رایگان پشتیبان برای PDF متنی: استخراج PDF به Markdown با Cloudflare، سپس مدل
  متنی ارزان.
- مسیر پشتیبان PDF اسکن‌شده/دستنویس: Mistral OCR فقط در صورت نیاز؛ سپس مدل متنی
  ارزان. این مسیر رایگان دائمی نیست اما هزینهٔ آن بر اساس صفحه اندک است.
- Groq/Cloudflare Workers AI برای تحلیل متن استخراج‌شده مناسب‌اند، نه به‌عنوان مسیر اصلی
  PDFهای طولانی.
- LM Studio مسیر اختیاری و بدون هزینه برای کارهای کم‌ریسک است؛ خروجی پزشکی آن بدون
  بازبینی مدیر منتشر نمی‌شود.

## معماری هدف برای کاهش مصرف

1. محاسبهٔ SHA-256 و استفادهٔ مجدد از نتیجهٔ فایل تکراری.
2. تشخیص PDF متنی در برابر اسکن/دستنویس پیش از فراخوانی مدل.
3. مرحلهٔ A: فقط استخراج، خلاصهٔ طلایی، تشخیص مبحث و هشدار؛ بدون ساخت هم‌زمان همهٔ
   درسنامه‌ها و آزمون‌ها.
4. مدیر نوع خروجی لازم را انتخاب می‌کند: درسنامه، فلش‌کارت، MCQ یا KF/PMP.
5. مرحلهٔ B فقط خروجی‌های انتخاب‌شده را می‌سازد و با کلید
   `file_hash + prompt_version + output_type` cache می‌شود.
6. صف سری، backoff بر اساس `Retry-After`، سقف مصرف روزانه و نمایش مصرف در پنل مدیریت.
7. هیچ خروجی پزشکی بدون بازبینی انسانی وارد محتوای canonical نمی‌شود.

این معماری مصرف را بیش از تعویض سادهٔ مدل کاهش می‌دهد، چون تولیدهای طولانی و غیرلازم
پیش از تصمیم مدیر انجام نمی‌شوند.

## منابع رسمی

- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini document understanding: https://ai.google.dev/gemini-api/docs/document-processing
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini available regions: https://ai.google.dev/gemini-api/docs/available-regions
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Groq vision: https://console.groq.com/docs/vision
- OpenRouter PDF processing: https://openrouter.ai/docs/features/multimodal/pdfs
- OpenRouter provider routing: https://openrouter.ai/docs/features/provider-routing
- Mistral API pricing: https://docs.mistral.ai/inference/pricing
- Mistral usage and limits: https://docs.mistral.ai/admin/billing-usage/usage-limits
