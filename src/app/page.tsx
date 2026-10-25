import Link from "next/link";

export default function DashboardPage() {
  const kpiCards = [
    { label: "รูปแบบคลังสินค้า", value: "In-House (คลังบริษัท)", sub: "ไม่ต้องแยกบิลรายลูกค้า 3PL" },
    { label: "โหมดควบคุมสต็อก", value: "Serial Number (S/N)", sub: "ตรวจสอบย้อนหลังได้รายชิ้น 100%" },
    { label: "การค้นหาเมื่อไม่รู้ S/N", value: "Multi-Filter Search", sub: "กรองตามโซน, ชั้นวาง, รุ่น, Lot, ใบรับของ" },
    { label: "ฐานข้อมูล", value: "SQLite (WAL Mode)", sub: "ไม่ต้องใช้ Docker รันผ่าน Node.js ทันที" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          ระบบบริหารคลังสินค้าภายในองค์กร (In-House WMS)
        </h2>
        <p className="text-slate-600 mt-1">
          ออกแบบเฉพาะสำหรับการควบคุมหมายเลขเครื่องรายชิ้น (Serial Number Tracking) พร้อมระบบค้นหาหลายมิติแม้ไม่ทราบรหัส S/N
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Link
          href="/inventory"
          className="bg-white p-6 rounded-xl border-2 border-blue-500 hover:bg-blue-50/30 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-blue-600 uppercase">
            New: Multi-Filter Inventory Search
          </span>
          <h3 className="text-lg font-bold mt-1">
            ค้นหาคลังสินค้า & ค้นหาเมื่อไม่รู้ Serial Number
          </h3>
          <p className="text-sm text-slate-600 mt-2">
            กรองดูสต็อกและค้นหาหมายเลขเครื่องจากชื่อสินค้า, หมวดหมู่, โซนคลัง, ชั้นวาง (Bin Location), เลขที่เอกสาร GRN/SO, Lot หรือช่วงวันที่รับเข้า
          </p>
        </Link>

        <Link
          href="/serials"
          className="bg-white p-6 rounded-xl border border-slate-200 hover:border-purple-500 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-purple-600 uppercase">Traceability</span>
          <h3 className="text-lg font-bold mt-1">ตรวจสอบประวัติ Serial Number รายชิ้น</h3>
          <p className="text-sm text-slate-600 mt-2">
            สแกนหรือคลิกเลือก S/N จากหน้าค้นหาคลังสินค้า เพื่อดูเส้นทางการเคลื่อนไหวตั้งแต่รับเข้าจนถึงส่งมอบ
          </p>
        </Link>

        <Link
          href="/inbound"
          className="bg-white p-6 rounded-xl border border-slate-200 hover:border-blue-500 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-blue-600 uppercase">Inbound</span>
          <h3 className="text-lg font-bold mt-1">สแกนรับสินค้าเข้าคลัง</h3>
          <p className="text-sm text-slate-600 mt-2">
            ยิงบาร์โค้ดชั้นวาง รหัส SKU และยิงสะสมหมายเลข Serial Number รายชิ้นพร้อมป้องกัน S/N ซ้ำอัตโนมัติ
          </p>
        </Link>

        <Link
          href="/outbound"
          className="bg-white p-6 rounded-xl border border-slate-200 hover:border-emerald-500 shadow-sm transition block"
        >
          <span className="text-xs font-semibold text-emerald-600 uppercase">Outbound</span>
          <h3 className="text-lg font-bold mt-1">สแกนหยิบจ่ายสินค้าออก</h3>
          <p className="text-sm text-slate-600 mt-2">
            บังคับยิงบาร์โค้ดชั้นวางคู่กับ Serial Number เพื่อตรวจสอบว่าหยิบถูกตำแหน่งและถูกรุ่นก่อนตัดสต็อก
          </p>
        </Link>
      </div>
    </div>
  );
}
