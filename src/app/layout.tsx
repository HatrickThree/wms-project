import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "In-House WMS | Serial Number Tracking",
  description: "ระบบบริหารจัดการคลังสินค้าภายในองค์กรพร้อมระบบควบคุม Serial Number รายชิ้น",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="min-h-screen flex flex-col md:flex-row">
        <aside className="w-full md:w-64 bg-slate-900 text-white p-5 flex-shrink-0">
          <div className="mb-8">
            <span className="text-xs uppercase tracking-wider bg-blue-600 px-2 py-1 rounded font-semibold">
              In-House WMS
            </span>
            <h1 className="text-xl font-bold mt-2">คลังสินค้าบริษัท</h1>
            <p className="text-xs text-slate-400">Serial Number Tracking System</p>
          </div>
          <nav className="space-y-2 text-sm">
            <Link
              href="/"
              className="block px-3 py-2.5 rounded-lg hover:bg-slate-800 transition"
            >
              1. ภาพรวมคลังสินค้า (Dashboard)
            </Link>
            <Link
              href="/inbound"
              className="block px-3 py-2.5 rounded-lg hover:bg-slate-800 transition"
            >
              2. รับสินค้าเข้า + ยิง S/N (Inbound)
            </Link>
            <Link
              href="/outbound"
              className="block px-3 py-2.5 rounded-lg hover:bg-slate-800 transition"
            >
              3. หยิบจ่ายสินค้าด้วย S/N (Outbound)
            </Link>
            <Link
              href="/serials"
              className="block px-3 py-2.5 rounded-lg hover:bg-slate-800 transition"
            >
              4. ตรวจสอบประวัติ S/N (Traceability)
            </Link>
          </nav>
        </aside>
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
