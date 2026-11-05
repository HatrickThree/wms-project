# ตั้งค่า Supabase และ Vercel

โค้ดใช้ PostgreSQL ผ่าน Prisma 6 และ Supabase เป็นฐานข้อมูล บัญชี ADMIN / STAFF / INSTRUCTOR / STUDENT ยังคงเป็นบัญชีภายใน WMS ไม่ต้องเปิด Supabase Auth และไม่ต้องมี Supabase SDK ในเบราว์เซอร์

## 1. สร้างฐานข้อมูล

สร้าง Supabase Project ใหม่สำหรับ WMS โดยเฉพาะ เก็บรหัสผ่านฐานข้อมูลไว้ในเครื่อง จากปุ่ม **Connect** คัดลอกค่าของโปรเจ็กต์จริงสองชุดลง `.env`:

- `DATABASE_URL`: Transaction pooler พอร์ต 6543 สำหรับเว็บ เพิ่ม `pgbouncer=true&connection_limit=1&sslmode=require` ใน query string
- `DIRECT_URL`: Session pooler พอร์ต 5432 สำหรับคำสั่งติดตั้ง/ย้ายข้อมูล หรือ Direct connection หากเครื่องรองรับ IPv6 ใช้ `sslmode=require`

ใช้โฮสต์และชื่อผู้ใช้ตามที่หน้า Connect แสดงจริง ตัวอย่างใน `.env.example` เป็นเพียงแม่แบบ รหัสผ่านที่มีอักขระพิเศษต้องเข้ารหัสสำหรับ URL ห้ามใช้ project URL, anon key หรือ service role key แทน PostgreSQL connection string และห้ามตั้งสองค่านี้ขึ้นต้นด้วย `NEXT_PUBLIC_`

ใช้บัญชีฐานข้อมูลฝั่งเซิร์ฟเวอร์ เช่น `postgres` ของโปรเจ็กต์ใหม่นี้ หรือ Prisma role ที่ตั้งตามคู่มือ Supabase ไม่ใช้ role `anon` / `authenticated` เป็นการเชื่อมต่อ Prisma เพราะระบบใช้การอนุญาตผ่านบัญชี WMS

ไม่ต้องกำหนด `APP_ORIGIN` โค้ดไม่ปฏิเสธคำขอเพราะ Origin หรือ Sec-Fetch-Site แล้วตามที่เจ้าของระบบกำหนด คุกกี้ยังเป็น HttpOnly / SameSite=Lax และใช้ Secure เมื่อ URL คำขอเป็น HTTPS สิทธิ์บัญชีและการตรวจ `X-Workspace-Id` ยังทำงาน

## 2. ติดตั้งโครงสร้าง

ใช้ Node.js 24 และติดตั้ง:

```powershell
npm ci
npm run db:deploy
```

`postinstall` สร้าง Prisma Client ใน `node_modules/wms-prisma-client` อัตโนมัติ ไม่เชื่อมต่อหรือย้ายฐานข้อมูลระหว่าง build ตัว migration ของ PostgreSQL เริ่มที่ `202611050000_supabase` และรักษากฎคลังเดิมผ่าน triggers / CHECK / foreign keys พร้อมเปิด RLS และเพิกถอนการเข้าถึงตารางแอปจาก anon/authenticated

หากใช้ Supabase เป็นฐานข้อมูลผ่าน Prisma อย่างเดียว ให้ปิด **Data API** ใน API Settings ตามคู่มือ Supabase ระบบ WMS เรียกฐานข้อมูลผ่านเซิร์ฟเวอร์อยู่แล้ว

ห้ามใช้ `db:setup`, seed หรือ reset กับข้อมูลทำงาน `db:setup` มีข้อมูลสาธิตซึ่งเหมาะกับฐานข้อมูลทิ้งได้เท่านั้น

## 3. เลือกเริ่มใหม่หรือย้ายข้อมูลเดิม

ฐานข้อมูลใหม่ที่ไม่ย้ายข้อมูล: เปิดเว็บและสร้างผู้ดูแลคนแรกใน `/setup` แล้วตั้งสมาชิก/พื้นที่

กรณีย้าย SQLite เดิม: ให้สำรองและหยุดการทำรายการในระบบเดิมช่วงส่งออกจนตรวจรับปลายทางเสร็จ ใช้ฐานข้อมูลปลายทางที่ติดตั้ง migration แล้วและไม่มีข้อมูล WMS เท่านั้น

```powershell
npm run db:export:sqlite -- --source prisma/dev.db --out .local/sqlite-export.json
npm run db:import:sqlite -- --file .local/sqlite-export.json --confirm-empty
```

เครื่องมืออ่าน SQLite แบบ read-only และ snapshot เดียว ตรวจ integrity/foreign keys แปลงชนิดวันเวลา/boolean/enum และส่งออกทุกตารางธุรกิจและการฝึกตามสคีมาปัจจุบัน ไฟล์ส่งออกมีข้อมูลส่วนตัวและ password hash จึงเก็บใน `.local/` ที่ไม่เข้า Git ห้ามเผยแพร่ไฟล์นี้

การนำเข้าตรวจ checksum/โครงสร้าง ปฏิเสธปลายทางที่มีข้อมูล นำเข้าเรียงตามความสัมพันธ์ในธุรกรรมเดียว และเทียบทุกคอลัมน์ก่อนยืนยัน หากไม่ตรงจะย้อนกลับทั้งหมด ไม่ย้าย migration history ของ SQLite และไม่ย้าย session/login attempts ทุกคนต้องเข้าสู่ระบบใหม่ บัญชี รหัสผ่านเดิม สต็อก เอกสาร สมาชิก และผลฝึกคงเดิม ไฟล์ SQLite ต้นทางไม่ถูกลบ

ตรวจจำนวนสินค้า/ยอดจอง/ประวัติ/ผลฝึกและทดลองงานสำคัญก่อนเปิดใช้งานจริง การตรวจเทียบตอนนำเข้ายังไม่แทนการตรวจรับโดยผู้ใช้ อย่าให้ระบบเดิมรับรายการใหม่หลังส่งออกแล้วเปิดปลายทางพร้อมกัน

SQLite migrations เดิมเก็บไว้แบบไม่แก้เนื้อหาใน `prisma/legacy-sqlite/` เพื่ออ้างอิง/กู้กลับเครื่องเดิมเท่านั้น ห้ามนำไปรันกับ PostgreSQL

## 4. ขึ้น Vercel

1. เชื่อม Git repository กับ Vercel แล้วเลือก Next.js
2. ตั้ง `DATABASE_URL` และ `DIRECT_URL` เป็นค่าฝั่งเซิร์ฟเวอร์ใน Production; Preview ให้ใช้ฐานข้อมูลทดสอบแยก
3. รัน `npm run db:deploy` จากเครื่องผู้ดูแลกับปลายทางที่เลือกก่อน deploy ครั้งแรก ไม่รัน migration หรือ import ทุกครั้งที่ build
4. Build command ใช้ `npm run build` ซึ่งสร้าง Prisma Client และเว็บ; ไม่ใช้ `.next-check` เป็น output deploy
5. ทดสอบ HTTPS: เข้าสู่ระบบ → เลือกพื้นที่ → รับเข้า → จอง → หยิบ → จ่ายออก → ตรวจนับ → ลบ/กู้คืนพื้นที่ด้วยผู้ดูแล ตรวจว่า Preview ไม่ได้เขียนสต็อกจริง

ยังไม่ต้องตั้ง `APP_ORIGIN` และไม่ต้องเปิดสิทธิ์ฐานข้อมูลให้เบราว์เซอร์โดยตรง

## 5. ตรวจในเครื่อง

`npm run check` ตรวจ production build ใน `.next-check` แยกจาก `.next` ใช้ `DATABASE_URL` ของ PostgreSQL ทดสอบเมื่อรันชุดทดสอบ

ชุดทดสอบใน `tests/` อนุญาตเฉพาะ PostgreSQL บน localhost/127.0.0.1 และชื่อฐานข้อมูลมีคำ `test` หรือ `qa` คั่นด้วย `_` พร้อม `ALLOW_DISPOSABLE_DATABASE=1` ห้ามรันกับ Supabase ที่มีข้อมูลทำงาน แต่ละชุดต้องเตรียมข้อมูลตั้งต้นตามที่ชุดทดสอบกำหนด

## อ้างอิง

- [Supabase: Prisma](https://supabase.com/docs/guides/database/prisma)
- [Supabase: Database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Vercel: Postgres](https://vercel.com/docs/postgres)
