"use client";

import React, { useState } from "react";

export default function InboundSerialPage() {
  const [referenceDoc, setReferenceDoc] = useState("GRN-202610-002");
  const [locationBarcode, setLocationBarcode] = useState("A-01-01-01");
  const [sku, setSku] = useState("SCAN-PRO-X1");
  const [currentSn, setCurrentSn] = useState("");
  const [serialList, setSerialList] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleAddSerial = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = currentSn.trim();
    if (!trimmed) return;
    if (serialList.includes(trimmed)) {
      setStatusMsg({ type: "err", text: `คุณสแกน S/N ${trimmed} ไปแล้วในรอบนี้!` });
      return;
    }
    setSerialList((prev) => [...prev, trimmed]);
    setCurrentSn("");
    setStatusMsg(null);
  };

  const handleSubmitInbound = async () => {
    setStatusMsg(null);
    try {
      const res = await fetch("/api/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceDoc,
          locationBarcode,
          sku,
          serialNumbers: serialList,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setStatusMsg({ type: "err", text: json.error });
      } else {
        setStatusMsg({
          type: "ok",
          text: `รับเข้าสำเร็จ ${json.data.receivedCount} S/N! ยอดคงเหลือที่ชั้นวาง ${json.data.locationBarcode} คือ ${json.data.newQtyOnHand} ชิ้น`,
        });
        setSerialList([]);
      }
    } catch {
      setStatusMsg({ type: "err", text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลได้" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          รับสินค้าเข้าคลังพร้อมยิง Serial Number (Serialized Inbound)
        </h2>
        <p className="text-sm text-slate-600">
          ใช้ปืนสแกนบาร์โค้ดยิงหมายเลข S/N ลงในช่องด้านล่าง ระบบจะสะสมรายการและตรวจสอบความซ้ำซ้อนให้อัตโนมัติ
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-lg text-sm font-medium ${
            statusMsg.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            เลขที่ใบรับสินค้า (GRN Doc)
          </label>
          <input
            value={referenceDoc}
            onChange={(e) => setReferenceDoc(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            บาร์โค้ดชั้นวาง (Location Barcode)
          </label>
          <input
            value={locationBarcode}
            onChange={(e) => setLocationBarcode(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            รหัสสินค้า (SKU)
          </label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <form onSubmit={handleAddSerial} className="flex gap-2">
        <input
          value={currentSn}
          onChange={(e) => setCurrentSn(e.target.value)}
          placeholder="ยิงบาร์โค้ด Serial Number ที่นี่ (เช่น SN2610-0004) แล้วกด Enter..."
          className="flex-1 border-2 border-blue-500 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none"
          autoFocus
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          + เพิ่ม S/N
        </button>
      </form>

      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-700">
            รายการ Serial Number ที่สแกนแล้ว ({serialList.length} ชิ้น)
          </span>
          {serialList.length > 0 && (
            <button
              type="button"
              onClick={() => setSerialList([])}
              className="text-xs text-red-600 hover:underline"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>
        <div className="border border-slate-200 rounded-lg p-3 min-h-[120px] bg-slate-50 flex flex-wrap gap-2">
          {serialList.length === 0 ? (
            <p className="text-xs text-slate-400 m-auto">ยังไม่มีรายการ Serial Number ที่สแกน</p>
          ) : (
            serialList.map((sn) => (
              <span
                key={sn}
                className="bg-white border border-slate-300 px-3 py-1 rounded-full text-xs font-mono flex items-center gap-2"
              >
                {sn}
                <button
                  type="button"
                  onClick={() => setSerialList((list) => list.filter((item) => item !== sn))}
                  className="text-slate-400 hover:text-red-600 font-bold"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={serialList.length === 0}
        onClick={handleSubmitInbound}
        className="w-full bg-emerald-600 disabled:bg-slate-300 text-white py-3 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition"
      >
        ยืนยันบันทึกรับสินค้าเข้าคลัง ({serialList.length} Serial Numbers)
      </button>
    </div>
  );
}
