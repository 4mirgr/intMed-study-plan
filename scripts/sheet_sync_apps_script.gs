// Google Apps Script — bind to the "IntMed - کاربران و ثبت‌نام‌ها" sheet and
// deploy as a Web App (Execute as: Me, Who has access: Anyone) so
// docs/index.html can POST a profile save to it with no login of its own.
//
// One-time setup (no tool reachable from a Claude Code session can do this
// deployment step — it has to be done by hand once):
//   1. Open the sheet → Extensions → Apps Script.
//   2. Paste this file's contents, replacing whatever's there.
//   3. Deploy → New deployment → type "Web app" → execute as "Me",
//      who has access "Anyone" → Deploy.
//   4. Copy the resulting URL (ends in /exec).
//   5. Paste that URL into GOOGLE_SHEET_WEBHOOK_URL in docs/index.html
//      (search for that exact constant name).
//
// Columns expected (row 1 header, already present in the sheet):
// A نام کاربری | B نقش | C نام و نام خانوادگی | D آخرین مدرک تحصیلی |
// E کد نظام/دانشجویی | F شماره موبایل | G ایمیل | H وضعیت | I تاریخ ثبت‌نام | J تاریخ تایید

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.username || "").trim()) {
      foundRow = i + 1; // getRange is 1-indexed
      break;
    }
  }
  if (foundRow === -1) {
    sheet.appendRow([
      data.username || "", "کاربر", data.fullName || "", data.degree || "",
      data.idNumber || "", data.phone || "", data.email || "",
      "تکمیل‌شده توسط کاربر", "", data.updatedAt || new Date().toISOString()
    ]);
  } else {
    sheet.getRange(foundRow, 3).setValue(data.fullName || "");
    sheet.getRange(foundRow, 4).setValue(data.degree || "");
    sheet.getRange(foundRow, 5).setValue(data.idNumber || "");
    sheet.getRange(foundRow, 6).setValue(data.phone || "");
    sheet.getRange(foundRow, 7).setValue(data.email || "");
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
