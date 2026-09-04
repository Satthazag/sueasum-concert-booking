# 🚀 Deploy Guide — VIP Booking System v2.0

## สรุปไฟล์ที่ต้องใช้

| ไฟล์ | หน้าที่ |
|------|---------|
| `apps_script_v2.js` | Backend (วาง ใน Google Apps Script) |
| `index.html` | หน้าจองโต๊ะลูกค้า (LINE LIFF) |
| `StaffUI.html` | หน้า Staff Portal (Google Login) |
| `SHEET_SETUP.md` | คู่มือตั้งค่า Google Sheet |

---

## STEP 1 — ตั้งค่า Google Sheet

> ทำตาม `SHEET_SETUP.md` ทุกข้อ

สรุปย่อ:
1. เปิด Google Sheet → จด **Sheet ID** จาก URL
2. ปรับ Row 1 ของ Sheet "Bookings" ให้มี 19 columns ตามที่ระบุ
3. สร้าง Sheet ใหม่: **AuditLog**, **StaffWhitelist**
4. เพิ่มอีเมล Staff ใน StaffWhitelist

---

## STEP 2 — Deploy Google Apps Script

1. เปิด [script.google.com](https://script.google.com) → สร้าง Project ใหม่
2. ลบโค้ดเดิมทั้งหมด → วางโค้ดจาก `apps_script_v2.js`
3. แก้ค่า CONFIG ที่บรรทัดบนสุด:
   ```javascript
   const SHEET_ID       = "YOUR_SHEET_ID";      // ← Sheet ID จาก Step 1
   const SLIP_FOLDER_ID = "";                    // ← ว่างได้ (สร้างอัตโนมัติ)
   const EXPIRE_MINUTES = 15;                    // ← เวลาหมดอายุ
   ```
4. บันทึก (Ctrl+S)
5. คลิก **Run** → เลือก `setupTrigger` → อนุญาต Permission
6. คลิก **Deploy** → **New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. คัดลอก **Deployment URL** (จะใช้ใน Step 3-4)

---

## STEP 3 — ตั้งค่า index.html (Customer)

เปิด `index.html` แก้ 2 บรรทัดนี้:
```javascript
const SCRIPT_URL = "วาง_DEPLOYMENT_URL_จาก_Step_2";
const LIFF_ID    = "วาง_LIFF_ID_ของคุณ";
```

> **ถ้ายังไม่มี LIFF ID:**
> 1. ไปที่ [developers.line.biz](https://developers.line.biz)
> 2. สร้าง Provider → สร้าง Channel ประเภท LINE Login
> 3. เพิ่ม LIFF App → ตั้ง URL เป็น URL ที่ host `index.html`
> 4. คัดลอก LIFF ID

---

## STEP 4 — ตั้งค่า StaffUI.html

เปิด `StaffUI.html` แก้ 1 บรรทัด:
```javascript
const SCRIPT_URL = "วาง_DEPLOYMENT_URL_จาก_Step_2";
```

---

## STEP 5 — Hosting (สำหรับใช้งานจริง)

### Option A: GitHub Pages (ฟรี)
1. สร้าง Repository ใน GitHub
2. Upload `index.html` และ `StaffUI.html`
3. ไป Settings → Pages → Deploy from main branch
4. URL: `https://username.github.io/repo-name/`

### Option B: Vercel (ฟรี, เร็วกว่า)
1. ไป [vercel.com](https://vercel.com)
2. Import GitHub repo
3. Deploy อัตโนมัติ

### Option C: เปิดไฟล์ HTML โดยตรง (ทดสอบ)
- เปิด `index.html` ในเบราว์เซอร์ได้เลย (แต่ LIFF ไม่ทำงาน)

---

## STEP 6 — ทดสอบ

### ทดสอบ Backend (ด้วย URL):
```
GET: [Deployment URL]?action=getBookings
```
ควรได้ `[]` หรือ array ของการจอง

### ทดสอบ Booking:
```bash
POST: [Deployment URL]
Body: {"action":"book","tableNo":50,"name":"ทดสอบ","phone":"0812345678"}
```
ควรได้ `{"success":true,"bookingId":"BK-20260904-0001",...}`

### ทดสอบ Staff:
1. เปิด `StaffUI.html`
2. Login ด้วย Email ที่อยู่ใน StaffWhitelist
3. ตรวจสอบ Dashboard Stats

---

## ✅ Checklist ก่อน Go-Live

- [ ] Sheet ID ถูกต้องใน `apps_script_v2.js`
- [ ] Staff Email เพิ่มใน Sheet "StaffWhitelist" แล้ว
- [ ] Deployment URL ใส่ใน `index.html` และ `StaffUI.html` แล้ว
- [ ] LIFF ID ใส่ใน `index.html` แล้ว
- [ ] Trigger `expirePendingBookings` ทำงานทุก 5 นาที (ตรวจสอบใน Triggers tab)
- [ ] ทดสอบจองโต๊ะ 1 ครั้ง และตรวจว่าข้อมูลขึ้น Sheet
- [ ] ทดสอบ Export CSV จาก StaffUI
- [ ] ทดสอบ Backup จาก StaffUI

---

## 🔴 สิ่งที่ต้องใส่ก่อน Go-Live

| ค่า | ไฟล์ | บรรทัด |
|-----|------|--------|
| `SHEET_ID` | `apps_script_v2.js` | 5 |
| `LIFF_ID` | `index.html` | ~374 |
| `SCRIPT_URL` | `index.html` | ~373 |
| `SCRIPT_URL` | `StaffUI.html` | ~2 ใน script |
| Staff emails | Google Sheet → StaffWhitelist | - |
