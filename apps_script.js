// ==========================================
// ระบบหลังบ้าน (Google Apps Script)
// รองรับทั้ง API (ลูกค้า) และ หน้าจอพนักงาน (Google Login)
// ==========================================

const SHEET_NAME = "Bookings";

// ⚠️ ใส่ Email ของพนักงานที่อนุญาตให้จัดการระบบได้ (ถ้าปล่อยว่างไว้ ทุกคนที่มีลิงก์พนักงานและล็อกอิน Google จะเข้าได้)
const ALLOWED_STAFF_EMAILS = [
  // "manager@gmail.com",
  // "staff1@gmail.com"
];

// ==========================================
// 1. จัดการ Request แบบ GET (ดึงข้อมูลโต๊ะ หรือ เปิดหน้าเว็บพนักงาน)
// ==========================================
function doGet(e) {
  // หากระบุ ?mode=api แปลว่าลูกค้ากำลังโหลดแผนผังโต๊ะ
  if (e.parameter.mode === 'api') {
    return getPublicBookings();
  }
  
  // หากไม่มีพารามิเตอร์ ให้ถือว่าพนักงานกำลังเปิดหน้าเว็บ
  return getStaffPortal();
}

// ==========================================
// 2. จัดการ Request แบบ POST (ลูกค้าจองโต๊ะ หรือ พนักงานอัปเดตสถานะ)
// ==========================================
function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    const tableNo = requestData.table;
    const newStatus = requestData.status;
    let targetRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == tableNo) {
        targetRowIndex = i + 1;
        break;
      }
    }

    // กรณียกเลิกโต๊ะ
    if (newStatus === 'cancelled' || newStatus === 'available') {
      if (targetRowIndex !== -1) {
        sheet.deleteRow(targetRowIndex);
      }
      return createJsonResponse({ success: true, message: "Cancelled" });
    }

    // กรณีพนักงานกดยืนยันชำระเงิน (ต้องมีรหัสอัปเดต)
    if (newStatus === 'paid' && targetRowIndex !== -1) {
      sheet.getRange(targetRowIndex, 2).setValue('paid');
      sheet.getRange(targetRowIndex, 6).setValue(requestData.amount || 2000); // Amount
      sheet.getRange(targetRowIndex, 8).setValue(new Date().toISOString()); // Paid Time
      return createJsonResponse({ success: true, message: "Marked as paid" });
    }

    // กรณีลูกค้าจองโต๊ะ (เพิ่มข้อมูลใหม่ หรืออัปเดต)
    const rowData = [
      tableNo,
      'pending',
      requestData.name || "",
      requestData.phone || "",
      requestData.note || "",
      0, // amount
      new Date().toISOString(), // time
      "", // paidTime
      requestData.lineUserId || "",
      requestData.lineDisplayName || ""
    ];

    if (targetRowIndex !== -1) {
      sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    return createJsonResponse({ success: true });
    
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString() });
  }
}

// ==========================================
// ฟังก์ชันย่อย (Helpers)
// ==========================================

function getPublicBookings() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  let bookings = {};

  if (data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = row[1];
      if (status !== 'available' && status !== 'cancelled') {
        // ส่งไปแค่สถานะ (ซ่อนชื่อ เบอร์โทร และ LINE เพื่อความปลอดภัยของลูกค้า)
        bookings[row[0]] = { table: row[0], status: status };
      }
    }
  }
  return createJsonResponse(bookings);
}

function getStaffPortal() {
  const email = Session.getActiveUser().getEmail();
  
  // ตรวจสอบสิทธิ์การเข้าถึง
  if (ALLOWED_STAFF_EMAILS.length > 0 && !ALLOWED_STAFF_EMAILS.includes(email)) {
    return HtmlService.createHtmlOutput(`<h2>ไม่อนุญาตให้เข้าถึง (Access Denied)</h2><p>อีเมล ${email} ไม่มีสิทธิ์เข้าใช้งานระบบจัดการโต๊ะ</p>`);
  }

  // ดึงหน้า StaffUI.html มาแสดงผล
  const htmlTemplate = HtmlService.createTemplateFromFile('StaffUI');
  htmlTemplate.userEmail = email;
  htmlTemplate.bookingsData = JSON.stringify(getAllBookingsForStaff());
  
  return htmlTemplate.evaluate()
    .setTitle('ระบบจัดการโต๊ะ (พนักงาน)')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getAllBookingsForStaff() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  let bookings = {};
  if (data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const status = row[1];
      if (status !== 'available' && status !== 'cancelled') {
        bookings[row[0]] = {
          table: row[0],
          status: status,
          name: row[2],
          phone: row[3],
          note: row[4],
          amount: row[5],
          time: row[6],
          paidTime: row[7],
          lineName: row[9] || "-"
        };
      }
    }
  }
  return bookings;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // เพิ่ม Column สำหรับ LINE
    sheet.appendRow(["TableNo", "Status", "Name", "Phone", "Note", "Amount", "Time", "PaidTime", "LineUID", "LineName"]);
    sheet.getRange("A1:J1").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
