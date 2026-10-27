# wms-project-test (In-House WMS with Serial Number Tracking — SQLite Edition)

ระบบบริหารจัดการคลังสินค้าภายในองค์กร (In-House Warehouse Management System) พัฒนาด้วย **Next.js (App Router) + TypeScript + Prisma ORM + SQLite + Tailwind CSS** รองรับการควบคุมหมายเลขเครื่องรายชิ้น (**Serial Number Tracking**) โดยไม่ต้องติดตั้ง Docker หรือตั้งค่า Database Server แยกต่างหาก

## การเริ่มต้นใช้งาน (Quick Start — ไม่ต้องใช้ Docker)

1. ติดตั้งแพ็กเกจทั้งหมด:
   ```bash
   npm install
   ```
2. สร้างไฟล์ฐานข้อมูล SQLite (`prisma/dev.db`) พร้อมเติมข้อมูลตั้งต้น (Seed Data):
   ```bash
   npm run db:setup
   ```
3. เปิดเซิร์ฟเวอร์พัฒนา:
   ```bash
   npm run dev
   ```
   เข้าใช้งานได้ที่ `http://localhost:3000`

## หน้าจอ WMS

หน้าจอใช้ **shadcn/ui + Radix UI + Tailwind CSS 3** รองรับมือถือและเครื่องสแกนแบบคีย์บอร์ด ประกอบด้วยภาพรวมคลังจากข้อมูลจริง ค้นหาสต็อก รับเข้า จ่ายออก และประวัติ Serial

- รับเข้า: สแกนสะสมก่อนบันทึก พร้อมตรวจ Serial ซ้ำและเตือนงานค้าง
- จ่ายออก: ตรวจ Serial และชั้นวาง แล้วทบทวนในกล่องยืนยันก่อนตัดจ่ายจริง
- ค้นหา: เก็บตัวกรองใน URL รองรับวันที่ตาม Asia/Bangkok และแสดงขอบเขตสูงสุด 300 S/N ชัดเจน
- ตาราง Serial ใช้ TanStack Table เรียงและแบ่งหน้าเฉพาะข้อมูลที่โหลด
- ประวัติแสดงสถานะภาษาไทยและการเคลื่อนไหวตามเวลาไทย

อ่านรายละเอียดดีไซน์และขอบเขตระยะถัดไปใน [เอกสาร UX/UI](docs/WMS-UX-UI-SHADCN.md)

ตรวจสอบสำหรับ production ด้วย `npm run build` หากติดตั้งแพ็กเกจหรือเปลี่ยนการตั้งค่า Tailwind ขณะที่เว็บเปิดอยู่ ให้เริ่มเซิร์ฟเวอร์พัฒนาใหม่เพื่อโหลดการตั้งค่าให้ครบ
