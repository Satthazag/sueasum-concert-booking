// ============================================================
//  VIP BOOKING SYSTEM — Google Apps Script Backend v2.0
//  วงพ่อจริตแม่ THE FATHER | LIVE SHOW & RESTAURANT
// ============================================================

// ── CONFIG ─────────────────────────────────────────────────
const SHEET_ID         = "139sS88RnVR-HHOlwxlVyF0IOyVe1K_xUwqIAjFn95c8";
const SLIP_FOLDER_ID   = "";                               // ← ใส่ Drive Folder ID (ว่าง = สร้างอัตโนมัติ)
const EXPIRE_MINUTES   = 15;                               // นาทีก่อน pending หมดอายุ
const ALLOWED_ORIGINS  = ["*"];                            // CORS

// Sheet names
const SH_BOOKINGS  = "Bookings";
const SH_AUDIT     = "AuditLog";
const SH_STAFF     = "StaffWhitelist";
const SH_PRICING   = "Pricing";

// Booking column indices (0-based) — ต้องตรงกับ header ใน Sheet
const COL = {
  booking_id:          0,   // A
  table_no:            1,   // B
  status:              2,   // C
  name:                3,   // D
  phone:               4,   // E
  note:                5,   // F
  amount:              6,   // G
  booked_at:           7,   // H
  line_uid:            8,   // I
  line_name:           9,   // J
  slip_url:            10,  // K
  slip_uploaded_at:    11,  // L
  verified_by:         12,  // M
  verified_at:         13,  // N
  paid_at:             14,  // O
  cancelled_at:        15,  // P
  cancelled_by:        16,  // Q
  cancel_reason:       17,  // R
  changed_from_table:  18,  // S
};
const TOTAL_COLS = 19;

// ── HELPERS ────────────────────────────────────────────────

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    initSheetHeaders(sh, name);
  }
  return sh;
}

function initSheetHeaders(sh, name) {
  const headers = {
    [SH_BOOKINGS]: [
      "booking_id","table_no","status","name","phone","note","amount","booked_at",
      "line_uid","line_name","slip_url","slip_uploaded_at","verified_by","verified_at",
      "paid_at","cancelled_at","cancelled_by","cancel_reason","changed_from_table"
    ],
    [SH_AUDIT]: ["timestamp","booking_id","table_no","action","done_by","before_status","after_status","note"],
    [SH_STAFF]: ["email","role","name"],
    [SH_PRICING]: ["table_from","table_to","zone","price"],
  };
  if (headers[name]) {
    sh.appendRow(headers[name]);
    sh.getRange(1, 1, 1, headers[name].length)
      .setFontWeight("bold")
      .setBackground("#1a1a2e")
      .setFontColor("#ffffff");
  }
}

function now() {
  return new Date().toISOString();
}

function jsonResponse(data, status) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function errorResponse(msg, code) {
  return jsonResponse({ success: false, error: msg, code: code || 400 });
}

// ── PRICING (Server-side — ไม่เชื่อ Client) ──────────────
function getPriceByTable(tableNo) {
  const n = parseInt(tableNo);
  if (n >= 1  && n <= 31)  return 1600;  // Zone B
  if (n >= 32 && n <= 100) return 2000;  // Zone A
  return 2000; // default
}

function getZoneByTable(tableNo) {
  const n = parseInt(tableNo);
  return (n >= 1 && n <= 31) ? "B" : "A";
}

// ── BOOKING ID GENERATOR ───────────────────────────────────
function generateBookingId() {
  const sh = getSheet(SH_BOOKINGS);
  const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMMdd");
  const prefix = "BK-" + today + "-";

  const data = sh.getDataRange().getValues();
  let maxSeq = 0;
  data.slice(1).forEach(row => {
    const bid = String(row[COL.booking_id] || "");
    if (bid.startsWith(prefix)) {
      const seq = parseInt(bid.replace(prefix, "")) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return prefix + nextSeq;
}

// ── STAFF AUTHORIZATION ────────────────────────────────────
function isStaff(email) {
  if (!email) return false;
  try {
    const sh = getSheet(SH_STAFF);
    const data = sh.getDataRange().getValues();
    return data.slice(1).some(r => r[0].toString().toLowerCase() === email.toLowerCase());
  } catch(e) {
    return false;
  }
}

function requireStaff(email) {
  if (!isStaff(email)) {
    throw new Error("UNAUTHORIZED: Staff permission required");
  }
}

// ── AUDIT LOG ──────────────────────────────────────────────
function auditLog(bookingId, tableNo, action, doneBy, beforeStatus, afterStatus, note) {
  try {
    const sh = getSheet(SH_AUDIT);
    sh.appendRow([now(), bookingId, tableNo, action, doneBy || "SYSTEM", beforeStatus || "", afterStatus || "", note || ""]);
  } catch(e) {
    console.error("Audit log failed:", e);
  }
}

// ── FIND ROW BY TABLE OR BOOKING ID ───────────────────────
function findRowByTable(tableNo) {
  const sh = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[COL.table_no]) === String(tableNo) &&
        !["cancelled","expired"].includes(String(row[COL.status]))) {
      return { rowIndex: i + 1, data: row };
    }
  }
  return null;
}

function findRowByBookingId(bookingId) {
  const sh = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL.booking_id]) === String(bookingId)) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  return null;
}

// ── GET SLIP FOLDER ────────────────────────────────────────
function getSlipFolder() {
  if (SLIP_FOLDER_ID) {
    return DriveApp.getFolderById(SLIP_FOLDER_ID);
  }
  // สร้าง folder อัตโนมัติถ้ายังไม่มี
  const root = DriveApp.getRootFolder();
  const name = "VIP_Booking_Slips";
  const existing = root.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : root.createFolder(name);
}

// ══════════════════════════════════════════════════════════
//  PUBLIC API HANDLERS
// ══════════════════════════════════════════════════════════

// ── GET BOOKINGS (Public — ไม่เปิดเผย PII) ───────────────
function handleGetBookings() {
  const sh = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();
  const result = [];

  data.slice(1).forEach(row => {
    const status = String(row[COL.status] || "available");
    if (!row[COL.booking_id]) return; // ข้าม row ว่าง
    // คืนแค่ข้อมูลที่ลูกค้าทั่วไปควรเห็น (ไม่มี PII)
    result.push({
      tableId:    row[COL.table_no],
      bookingId:  row[COL.booking_id],
      status:     status,
      zone:       getZoneByTable(row[COL.table_no]),
      price:      getPriceByTable(row[COL.table_no]),
    });
  });

  return jsonResponse(result);
}

// ── CREATE BOOKING (Public) ────────────────────────────────
function handleCreateBooking(params) {
  const { tableNo, name, phone, note, lineUid, lineName } = params;

  if (!tableNo) return errorResponse("Missing tableNo");
  if (!name || !phone) return errorResponse("Missing name or phone");

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) {
      return errorResponse("Server busy, please retry in a moment", 503);
    }

    // ตรวจสอบ Double Booking
    const existing = findRowByTable(tableNo);
    if (existing) {
      const st = String(existing.data[COL.status]);
      if (["pending","slip_uploaded","verified","paid"].includes(st)) {
        return errorResponse("โต๊ะ " + tableNo + " ถูกจองแล้ว (status: " + st + ")", 409);
      }
    }

    const bookingId = generateBookingId();
    const price     = getPriceByTable(tableNo);
    const bookedAt  = now();

    const sh = getSheet(SH_BOOKINGS);

    if (existing) {
      // อัปเดต row เดิม (เดิมเป็น cancelled/expired)
      const rng = sh.getRange(existing.rowIndex, 1, 1, TOTAL_COLS);
      const newRow = Array(TOTAL_COLS).fill("");
      newRow[COL.booking_id]  = bookingId;
      newRow[COL.table_no]    = tableNo;
      newRow[COL.status]      = "pending";
      newRow[COL.name]        = name;
      newRow[COL.phone]       = phone;
      newRow[COL.note]        = note || "";
      newRow[COL.amount]      = price;
      newRow[COL.booked_at]   = bookedAt;
      newRow[COL.line_uid]    = lineUid || "";
      newRow[COL.line_name]   = lineName || "";
      rng.setValues([newRow]);
    } else {
      // เพิ่ม row ใหม่
      const newRow = Array(TOTAL_COLS).fill("");
      newRow[COL.booking_id]  = bookingId;
      newRow[COL.table_no]    = tableNo;
      newRow[COL.status]      = "pending";
      newRow[COL.name]        = name;
      newRow[COL.phone]       = phone;
      newRow[COL.note]        = note || "";
      newRow[COL.amount]      = price;
      newRow[COL.booked_at]   = bookedAt;
      newRow[COL.line_uid]    = lineUid || "";
      newRow[COL.line_name]   = lineName || "";
      sh.appendRow(newRow);
    }

    auditLog(bookingId, tableNo, "book", lineName || phone, "", "pending",
      "name=" + name + " phone=" + phone);

    return jsonResponse({
      success:   true,
      bookingId: bookingId,
      tableNo:   tableNo,
      status:    "pending",
      amount:    price,
      zone:      getZoneByTable(tableNo),
      expireAt:  new Date(new Date(bookedAt).getTime() + EXPIRE_MINUTES * 60000).toISOString(),
    });

  } catch(e) {
    return errorResponse(e.message || "Booking failed", 500);
  } finally {
    lock.releaseLock();
  }
}

// ── UPLOAD SLIP (Public) ──────────────────────────────────
function handleUploadSlip(params) {
  const { bookingId, slipBase64, mimeType } = params;

  if (!bookingId || !slipBase64) return errorResponse("Missing bookingId or slipBase64");

  try {
    const found = findRowByBookingId(bookingId);
    if (!found) return errorResponse("Booking not found: " + bookingId, 404);

    const st = String(found.data[COL.status]);
    if (!["pending","slip_uploaded"].includes(st)) {
      return errorResponse("Cannot upload slip. Status is: " + st, 409);
    }

    // บันทึกไฟล์ลง Google Drive
    const folder = getSlipFolder();
    const blob   = Utilities.newBlob(
      Utilities.base64Decode(slipBase64),
      mimeType || "image/jpeg",
      bookingId + "_slip_" + Date.now() + ".jpg"
    );
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const slipUrl       = file.getUrl();
    const uploadedAt    = now();

    // อัปเดต row
    const sh  = getSheet(SH_BOOKINGS);
    const row = found.rowIndex;
    sh.getRange(row, COL.slip_url + 1).setValue(slipUrl);
    sh.getRange(row, COL.slip_uploaded_at + 1).setValue(uploadedAt);
    sh.getRange(row, COL.status + 1).setValue("slip_uploaded");

    auditLog(bookingId, found.data[COL.table_no], "slip_upload",
      found.data[COL.line_name] || found.data[COL.phone], st, "slip_uploaded", "url=" + slipUrl);

    return jsonResponse({ success: true, bookingId, slipUrl, status: "slip_uploaded" });

  } catch(e) {
    return errorResponse(e.message || "Upload failed", 500);
  }
}

// ── CHECK MY BOOKING (Public — ด้วยเบอร์โทร) ─────────────
function handleMyBooking(params) {
  const { phone } = params;
  if (!phone) return errorResponse("Missing phone");

  const sh   = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();
  const results = [];

  data.slice(1).forEach(row => {
    if (String(row[COL.phone]) === String(phone)) {
      results.push({
        bookingId: row[COL.booking_id],
        tableNo:   row[COL.table_no],
        status:    row[COL.status],
        amount:    row[COL.amount],
        bookedAt:  row[COL.booked_at],
        zone:      getZoneByTable(row[COL.table_no]),
        slipUrl:   row[COL.slip_url] ? "uploaded" : "",
      });
    }
  });

  return jsonResponse({ success: true, bookings: results });
}

// ══════════════════════════════════════════════════════════
//  STAFF API HANDLERS (ทุก handler ต้องผ่าน requireStaff)
// ══════════════════════════════════════════════════════════

// ── GET ALL BOOKINGS (Staff) ──────────────────────────────
function handleStaffGetBookings(params) {
  requireStaff(params.staffEmail);

  const sh   = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const result  = [];

  data.slice(1).forEach((row, i) => {
    if (!row[COL.booking_id]) return;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j]; });
    obj._rowIndex = i + 2;
    result.push(obj);
  });

  // Filter
  if (params.filterStatus)    result.filter(r => r.status === params.filterStatus);
  if (params.filterTable)     result.filter(r => String(r.table_no).includes(params.filterTable));
  if (params.filterPhone)     result.filter(r => String(r.phone).includes(params.filterPhone));
  if (params.filterName)      result.filter(r => String(r.name).includes(params.filterName));
  if (params.filterBookingId) result.filter(r => String(r.booking_id).includes(params.filterBookingId));

  return jsonResponse({ success: true, bookings: result });
}

// ── VERIFY SLIP (Staff) ────────────────────────────────────
function handleVerifySlip(params) {
  requireStaff(params.staffEmail);

  const { bookingId, staffEmail } = params;
  const found = findRowByBookingId(bookingId);
  if (!found) return errorResponse("Booking not found", 404);

  const before = String(found.data[COL.status]);
  if (before !== "slip_uploaded") return errorResponse("Status must be slip_uploaded, current: " + before, 409);

  const sh  = getSheet(SH_BOOKINGS);
  const row = found.rowIndex;
  sh.getRange(row, COL.verified_by + 1).setValue(staffEmail);
  sh.getRange(row, COL.verified_at + 1).setValue(now());
  sh.getRange(row, COL.status + 1).setValue("verified");

  auditLog(bookingId, found.data[COL.table_no], "verify_slip", staffEmail, before, "verified");

  return jsonResponse({ success: true, bookingId, status: "verified" });
}

// ── MARK PAID (Staff) ─────────────────────────────────────
function handleMarkPaid(params) {
  requireStaff(params.staffEmail);

  const { bookingId, staffEmail } = params;
  const found = findRowByBookingId(bookingId);
  if (!found) return errorResponse("Booking not found", 404);

  const before = String(found.data[COL.status]);
  if (!["verified","slip_uploaded","pending"].includes(before)) {
    return errorResponse("Cannot mark paid. Status: " + before, 409);
  }

  const sh  = getSheet(SH_BOOKINGS);
  const row = found.rowIndex;
  sh.getRange(row, COL.paid_at + 1).setValue(now());
  sh.getRange(row, COL.verified_by + 1).setValue(staffEmail);
  sh.getRange(row, COL.status + 1).setValue("paid");

  auditLog(bookingId, found.data[COL.table_no], "mark_paid", staffEmail, before, "paid");

  return jsonResponse({ success: true, bookingId, status: "paid" });
}

// ── CANCEL BOOKING (Staff — Soft Delete) ─────────────────
function handleCancelBooking(params) {
  requireStaff(params.staffEmail);

  const { bookingId, staffEmail, reason } = params;
  const found = findRowByBookingId(bookingId);
  if (!found) return errorResponse("Booking not found", 404);

  const before = String(found.data[COL.status]);
  if (before === "paid") return errorResponse("Cannot cancel a paid booking", 409);
  if (before === "cancelled") return errorResponse("Already cancelled", 409);

  const sh  = getSheet(SH_BOOKINGS);
  const row = found.rowIndex;
  sh.getRange(row, COL.cancelled_at + 1).setValue(now());
  sh.getRange(row, COL.cancelled_by + 1).setValue(staffEmail);
  sh.getRange(row, COL.cancel_reason + 1).setValue(reason || "");
  sh.getRange(row, COL.status + 1).setValue("cancelled");

  auditLog(bookingId, found.data[COL.table_no], "cancel", staffEmail, before, "cancelled", reason || "");

  return jsonResponse({ success: true, bookingId, status: "cancelled" });
}

// ── CHANGE TABLE (Staff) ──────────────────────────────────
function handleChangeTable(params) {
  requireStaff(params.staffEmail);

  const { bookingId, newTableNo, staffEmail } = params;
  if (!newTableNo) return errorResponse("Missing newTableNo");

  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return errorResponse("Server busy", 503);

    const found = findRowByBookingId(bookingId);
    if (!found) return errorResponse("Booking not found", 404);

    const before = String(found.data[COL.status]);
    if (["paid","cancelled","expired"].includes(before)) {
      return errorResponse("Cannot change table. Status: " + before, 409);
    }

    // ตรวจโต๊ะใหม่ว่าง
    const targetExisting = findRowByTable(newTableNo);
    if (targetExisting) {
      const tSt = String(targetExisting.data[COL.status]);
      if (["pending","slip_uploaded","verified","paid"].includes(tSt)) {
        return errorResponse("โต๊ะ " + newTableNo + " ถูกจองแล้ว", 409);
      }
    }

    const oldTable = found.data[COL.table_no];
    const newPrice = getPriceByTable(newTableNo);
    const sh       = getSheet(SH_BOOKINGS);
    const row      = found.rowIndex;

    sh.getRange(row, COL.changed_from_table + 1).setValue(oldTable);
    sh.getRange(row, COL.table_no + 1).setValue(newTableNo);
    sh.getRange(row, COL.amount + 1).setValue(newPrice);

    auditLog(bookingId, newTableNo, "change_table", staffEmail, oldTable, newTableNo,
      "from table " + oldTable + " to " + newTableNo);

    return jsonResponse({
      success: true, bookingId,
      oldTable, newTable: newTableNo, newPrice,
      zone: getZoneByTable(newTableNo)
    });

  } finally {
    lock.releaseLock();
  }
}

// ── EXPORT CSV (Staff) ────────────────────────────────────
function handleExportCsv(params) {
  requireStaff(params.staffEmail);

  const sh   = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();

  // Exclude sensitive columns from export if needed (here we include all for staff)
  const csv = data.map(row =>
    row.map(cell => {
      const s = String(cell || "").replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s + '"' : s;
    }).join(",")
  ).join("\n");

  // Audit
  auditLog("-", "-", "export_csv", params.staffEmail, "", "", "exported " + (data.length-1) + " rows");

  return ContentService.createTextOutput(csv)
    .setMimeType(ContentService.MimeType.CSV);
}

// ── BACKUP SHEET (Staff) ──────────────────────────────────
function handleBackup(params) {
  requireStaff(params.staffEmail);

  try {
    const ss        = getSpreadsheet();
    const src       = ss.getSheetByName(SH_BOOKINGS);
    if (!src) return errorResponse("Bookings sheet not found");

    const dateStr   = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd_HH-mm");
    const backupName = "Backup_" + dateStr;
    src.copyTo(ss).setName(backupName);

    auditLog("-", "-", "backup", params.staffEmail, "", "", "backup created: " + backupName);

    return jsonResponse({ success: true, backupName });
  } catch(e) {
    return errorResponse(e.message || "Backup failed", 500);
  }
}

// ── GET AUDIT LOG (Staff) ─────────────────────────────────
function handleGetAuditLog(params) {
  requireStaff(params.staffEmail);

  const sh   = getSheet(SH_AUDIT);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  let result = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j]; });
    return obj;
  });

  // Filter by bookingId if provided
  if (params.bookingId) {
    result = result.filter(r => String(r.booking_id) === String(params.bookingId));
  }

  // Last 500 entries only (newest first)
  result = result.reverse().slice(0, 500);

  return jsonResponse({ success: true, logs: result });
}

// ── STAFF DASHBOARD STATS ─────────────────────────────────
function handleDashboard(params) {
  requireStaff(params.staffEmail);

  const sh   = getSheet(SH_BOOKINGS);
  const data = sh.getDataRange().getValues();

  const stats = {
    total: 0, available: 0, pending: 0, slip_uploaded: 0,
    verified: 0, paid: 0, cancelled: 0, expired: 0,
    revenue_total: 0, revenue_paid: 0, revenue_pending: 0, revenue_cancelled: 0
  };

  data.slice(1).forEach(row => {
    if (!row[COL.booking_id]) return;
    stats.total++;
    const st  = String(row[COL.status] || "available");
    const amt = Number(row[COL.amount]) || 0;
    if (stats[st] !== undefined) stats[st]++;
    stats.revenue_total += amt;
    if (st === "paid") stats.revenue_paid += amt;
    if (["pending","slip_uploaded","verified"].includes(st)) stats.revenue_pending += amt;
    if (st === "cancelled") stats.revenue_cancelled += amt;
  });
  stats.available = 100 - stats.pending - stats.slip_uploaded - stats.verified - stats.paid;

  return jsonResponse({ success: true, stats });
}

// ══════════════════════════════════════════════════════════
//  AUTO-EXPIRATION TRIGGER (ติดตั้งด้วย setupTrigger())
// ══════════════════════════════════════════════════════════

function expirePendingBookings() {
  const sh      = getSheet(SH_BOOKINGS);
  const data    = sh.getDataRange().getValues();
  const now_ms  = Date.now();
  const timeout = EXPIRE_MINUTES * 60 * 1000;
  let   expired = 0;

  data.slice(1).forEach((row, i) => {
    if (String(row[COL.status]) !== "pending") return;
    const bookedAt = new Date(row[COL.booked_at]);
    if (isNaN(bookedAt)) return;
    if ((now_ms - bookedAt.getTime()) >= timeout) {
      const rowIndex = i + 2;
      sh.getRange(rowIndex, COL.status + 1).setValue("expired");
      auditLog(
        row[COL.booking_id], row[COL.table_no],
        "expire", "SYSTEM", "pending", "expired",
        "timeout after " + EXPIRE_MINUTES + " min"
      );
      expired++;
    }
  });

  console.log("[Expire Trigger] Expired " + expired + " bookings");
}

// เรียก setupTrigger() 1 ครั้งตอนติดตั้ง Script
function setupTrigger() {
  // ลบ trigger เดิมก่อน (ถ้ามี)
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "expirePendingBookings") {
      ScriptApp.deleteTrigger(t);
    }
  });
  // สร้างใหม่ ทำงานทุก 5 นาที
  ScriptApp.newTrigger("expirePendingBookings")
    .timeBased().everyMinutes(5).create();
  console.log("Trigger created: expirePendingBookings every 5 minutes");
}

// ══════════════════════════════════════════════════════════
//  ENTRY POINTS
// ══════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const p      = e.parameter || {};
    const action = p.action || "";

    switch (action) {
      case "getBookings":  return handleGetBookings();
      case "myBooking":    return handleMyBooking(p);

      // Staff actions (GET)
      case "staffBookings": return handleStaffGetBookings(p);
      case "dashboard":     return handleDashboard(p);
      case "auditLog":      return handleGetAuditLog(p);
      case "export":        return handleExportCsv(p);

      default:
        return jsonResponse({ success: true, message: "VIP Booking API v2.0 — use action param" });
    }
  } catch(e) {
    if (e.message && e.message.startsWith("UNAUTHORIZED")) {
      return errorResponse("Unauthorized", 403);
    }
    return errorResponse(e.message || "Internal error", 500);
  }
}

function doPost(e) {
  try {
    let params = {};
    try { params = JSON.parse(e.postData.contents); } catch(x) { params = e.parameter || {}; }
    const action = params.action || "";

    switch (action) {
      // Public
      case "book":        return handleCreateBooking(params);
      case "uploadSlip":  return handleUploadSlip(params);

      // Staff
      case "verifySlip":   return handleVerifySlip(params);
      case "markPaid":     return handleMarkPaid(params);
      case "cancel":       return handleCancelBooking(params);
      case "changeTable":  return handleChangeTable(params);
      case "backup":       return handleBackup(params);

      default:
        return errorResponse("Unknown action: " + action, 400);
    }
  } catch(e) {
    if (e.message && e.message.startsWith("UNAUTHORIZED")) {
      return errorResponse("Unauthorized", 403);
    }
    return errorResponse(e.message || "Internal error", 500);
  }
}
