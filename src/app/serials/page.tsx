"use client";

import React, { useState } from "react";

interface SerialLookupResult {
  serialNumber: string;
  status: string;
  inboundDocNo: string;
  outboundDocNo?: string | null;
  receivedAt: string;
  shippedAt?: string | null;
  product: { sku: string; name: string };
  location?: { barcode: string; zone: string } | null;
  movements: Array<{
    id: string;
    movementType: string;
    referenceDoc: string;
    qtyChange: number;
    note?: string | null;
    createdAt: string;
  }>;
}

export default function SerialTraceabilityPage() {
  const [searchSn, setSearchSn] = useState("SN2610-0001");
  const [data, setData] = useState<SerialLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/serials/${encodeURIComponent(searchSn.trim())}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error);
      } else {
        setData(json.data);
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อค้นหาข้อมูลได้");
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          ตรวจสอบประวัติหมายเลขเครื่องรายชิ้น (Serial Number Traceability)
        </h2>
        <p className="text-sm text-slate-600">
          ค้นหาสถานะปัจจุบัน ตำแหน่งชั้นวาง และประวัติการเคลื่อนไหวตั้งแต่รับเข้าคลังจนถึงส่งออก
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={searchSn}
          onChange={(e) => setSearchSn(e.target.value)}
          placeholder="สแกนหรือพิมพ์หมายเลข Serial Number เช่น SN2610-0001"
          className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-mono"
        />
        <button
          type="submit"
          className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-800"
        >
          ค้นหาประวัติ S/N
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4 border-t border-slate-200 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Serial Number</span>
              <span className="font-mono font-bold text-slate-900">{data.serialNumber}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">สถานะปัจจุบัน</span>
              <span className="font-bold text-blue-600">{data.status}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">สินค้า (SKU)</span>
              <span className="font-semibold">{data.product.sku}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">ตำแหน่งชั้นวาง</span>
              <span className="font-mono font-semibold">
                {data.location ? data.location.barcode : "ออกจากคลังแล้ว"}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">
              ประวัติการเคลื่อนไหว (Immutable Stock Ledger)
            </h3>
            <div className="space-y-2">
              {data.movements.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-lg border border-slate-200 text-xs flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-slate-900 mr-2">{m.movementType}</span>
                    <span className="text-slate-600">เอกสาร: {m.referenceDoc}</span>
                    {m.note && <p className="text-slate-500 mt-0.5">{m.note}</p>}
                  </div>
                  <span className="text-slate-400">
                    {new Date(m.createdAt).toLocaleString("th-TH")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
