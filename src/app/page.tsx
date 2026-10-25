import Link from "next/link";

export default function DashboardPage() {
  const kpiCards = [
    { label: "รูปแบบคลังสินค้า", value: "In-House (คลังบริษัท)", sub: "ไม่ต้องแยกบิลรายลูกค้า 3PL" },
    { label: "โหมดควบคุมสต็อก", value: "Serial Number (S/N)", sub: "ตรวจสอบย้อนหลังได้รายชิ้น 100%" },
    { label: "จำนวน S/N พร้อมขาย", value: "3 ชิ้น (Seed)", sub: "รุ่น SCAN-PRO-X1 ที่ชั้นวาง A-01-01-01" },
    { label: "การป้องกันสต็อกติดลบ", value: "ACID Transaction", sub: "SQLite (WAL Mode) + Prisma ORM" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          ระบบบริหารคลังสินค้าภายในองค์กร (In-House WMS)
        </h2>
        <p className="text-slate-600 mt-1">
          ออกแบบเฉพาะสำหรับการควบคุมหมายเลขเครื่องรายชิ้น (Serial Number Tracking) ตั้งแต่รับเข้า จัดเก็บ จนถึงส่งมอบ
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{card.value}</p>
            <p className="text-xs text-slate-500 mt-2">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href="/inbound"
          className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-500 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-blue-600 uppercase">Step 1: Inbound</span>
          <h3 className="text-lg font-bold mt-1">สแกนรับสินค้าเข้าคลัง</h3>
          <p className="text-sm text-slate-600 mt-2">
            ยิงบาร์โค้ดชั้นวาง รหัส SKU และยิงสะสมหมายเลข Serial Number รายชิ้นพร้อมป้องกัน S/N ซ้ำอัตโนมัติ
          </p>
        </Link>

        <Link
          href="/outbound"
          className="bg-white p-6 rounded-xl border border-slate-200 hover:border-emerald-500 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-emerald-600 uppercase">Step 2: Outbound</span>
          <h3 className="text-lg font-bold mt-1">สแกนหยิบจ่ายสินค้าออก</h3>
          <p className="text-sm text-slate-600 mt-2">
            บังคับยิงบาร์โค้ดชั้นวางคู่กับ Serial Number เพื่อตรวจสอบว่าหยิบถูกตำแหน่งและถูกรุ่นก่อนตัดสต็อก
          </p>
        </Link>

        <Link
          href="/serials"
          className="bg-white p-6 rounded-xl border border-slate-200 hover:border-purple-500 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-purple-600 uppercase">Step 3: Traceability</span>
          <h3 className="text-lg font-bold mt-1">ค้นหาประวัติ Serial Number</h3>
          <p className="text-sm text-slate-600 mt-2">
            ตรวจสอบสถานะปัจจุบัน (IN_STOCK / SHIPPED) พิกัดชั้นวาง เลขที่ใบรับของ และใบสั่งขายของแต่ละ S/N
          </p>
        </Link>
      </div>
    </div>
  );
}
