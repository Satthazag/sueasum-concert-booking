# คู่มือตั้งค่า Google Sheet — VIP Booking System v2.0

## ขั้นตอนที่ 1: เปิด Google Sheet และจดบันทึก Sheet ID

1. เปิด Google Sheet ที่ใช้งานอยู่
2. ดู URL: `https://docs.google.com/spreadsheets/d/**SHEET_ID_อยู่ตรงนี้**/edit`
3. Copy ID ไปใส่ใน `apps_script_v2.js` บรรทัด:
   ```javascript
   const SHEET_ID = "วาง_ID_ที่นี่";
   ```

---

## ขั้นตอนที่ 2: ปรับ Sheet "Bookings"

> [!WARNING]
> ถ้ามีข้อมูลเดิมอยู่แล้ว ให้ **Backup ก่อน** โดยคลิกขวาที่ Tab Sheet → "Duplicate"

### ลบ Header เดิมทั้งหมด แล้วใส่ใหม่ตามลำดับนี้ (Row 1):

| Column | Header | หมายเหตุ |
|--------|--------|---------|
| A | booking_id | BK-YYYYMMDD-XXXX |
| B | table_no | หมายเลขโต๊ะ |
| C | status | available/pending/slip_uploaded/verified/paid/cancelled/expired |
| D | name | ชื่อลูกค้า |
| E | phone | เบอร์โทร |
| F | note | หมายเหตุ |
| G | amount | ราคา (บาท) |
| H | booked_at | เวลาจอง (ISO) |
| I | line_uid | LINE User ID |
| J | line_name | LINE Display Name |
| K | slip_url | URL รูปสลิป |
| L | slip_uploaded_at | เวลาอัปโหลดสลิป |
| M | verified_by | Email Staff ที่ตรวจสลิป |
| N | verified_at | เวลาตรวจสลิป |
| O | paid_at | เวลาชำระเงิน |
| P | cancelled_at | เวลายกเลิก |
| Q | cancelled_by | Email Staff ที่ยกเลิก |
| R | cancel_reason | เหตุผลยกเลิก |
| S | changed_from_table | โต๊ะเดิม (กรณีเปลี่ยนโต๊ะ) |

**วิธีใส่ Header อย่างรวดเร็ว:**
1. คลิก Cell A1
2. วางข้อความนี้ทีละ Column หรือ copy ทั้งแถว:
```
booking_id	table_no	status	name	phone	note	amount	booked_at	line_uid	line_name	slip_url	slip_uploaded_at	verified_by	verified_at	paid_at	cancelled_at	cancelled_by	cancel_reason	changed_from_table
```
(แยกด้วย Tab → วางใน Row 1 จะกระจายไปแต่ละ Column อัตโนมัติ)

---

## ขั้นตอนที่ 3: สร้าง Sheet "AuditLog"

1. คลิก **+** ด้านล่างเพื่อเพิ่ม Sheet ใหม่
2. ตั้งชื่อว่า **`AuditLog`** (ตัวพิมพ์ใหญ่-เล็กต้องตรงกัน)
3. ใส่ Header ใน Row 1:
```
timestamp	booking_id	table_no	action	done_by	before_status	after_status	note
```

---

## ขั้นตอนที่ 4: สร้าง Sheet "StaffWhitelist"

1. สร้าง Sheet ใหม่ชื่อ **`StaffWhitelist`**
2. ใส่ Header ใน Row 1:
```
email	role	name
```
3. ใส่ข้อมูลพนักงาน ตัวอย่าง:

| email | role | name |
|-------|------|------|
| manager@gmail.com | admin | คุณ X |
| staff1@gmail.com | staff | พนักงาน 1 |

> [!IMPORTANT]
> Email ต้องตรงกับ Google Account ที่ใช้ Login เข้า StaffUI ทุกตัวอักษร (ตัวพิมพ์เล็ก)

---

## ขั้นตอนที่ 5: ตรวจสอบ Google Sheet ID ใน `apps_script_v2.js`

ไปที่บรรทัด:
```javascript
const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE";
```
แก้เป็น ID ที่ได้จากขั้นตอนที่ 1

---

## ขั้นตอนที่ 6: Deploy Google Apps Script

1. เปิด [script.google.com](https://script.google.com)
2. สร้าง Project ใหม่ (หรือเปิด Project เดิม)
3. วางโค้ดจาก `apps_script_v2.js` ทั้งหมด
4. คลิก **Deploy → New Deployment**
5. ประเภท: **Web App**
6. Execute as: **Me**
7. Who has access: **Anyone** (เพื่อให้ลูกค้าเรียกได้)
8. คัดลอก **Deployment URL** → นำไปใส่ใน `index.html` และ `StaffUI.html`

---

## ขั้นตอนที่ 7: ติดตั้ง Auto-Expiration Trigger

1. ใน Apps Script Editor คลิก **Run** → เลือก function `setupTrigger`
2. อนุญาต Permission ที่ขอ (เข้า Spreadsheet + Triggers)
3. ตรวจสอบ Trigger ได้ที่: Triggers (นาฬิกา icon ด้านซ้าย)
4. จะเห็น `expirePendingBookings` ทำงานทุก 5 นาที

---

## สรุปโครงสร้าง Sheets ที่ต้องมี

| Sheet Name | หน้าที่ |
|-----------|---------|
| `Bookings` | ข้อมูลการจองหลัก |
| `AuditLog` | บันทึกทุก action |
| `StaffWhitelist` | รายชื่ออีเมล Staff |
