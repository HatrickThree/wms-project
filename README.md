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
