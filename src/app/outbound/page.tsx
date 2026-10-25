"use client";

import React, { useState } from "react";

export default function OutboundPickPage() {
  const [outboundDocNo, setOutboundDocNo] = useState("SO-202610-001");
  const [locationBarcode, setLocationBarcode] = useState("A-01-01-01");
  const [serialNumber, setSerialNumber] = useState("");
  const [resultMsg, setResultMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handlePickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResultMsg(null);
    try {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundDocNo,
          locationBarcode,
          serialNumber: serialNumber.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setResultMsg({ type: "err", text: json.error });
      } else {
        setResultMsg({
          type: "ok",
          text: `ตัดจ่ายสำเร็จ! S/N ${json.data.serialNumber} (${json.data.sku}) ถูกเปลี่ยนสถานะเป็น ${json.data.status} สำหรับใบเบิก ${json.data.outboundDocNo}`,
        });
        setSerialNumber("");
      }
    } catch {
      setResultMsg({ type: "err", text: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          สแกนหยิบและจ่ายสินค้าออกตาม Serial Number (Outbound Pick)
        </h2>
        <p className="text-sm text-slate-600">
          ระบบบังคับตรวจสอบว่าหมายเลข S/N ที่ยิงตรงกับตำแหน่งชั้นวางและอยู่ในสถานะพร้อมขาย (IN_STOCK)
        </p>
      </div>

      {resultMsg && (
        <div
          className={`p-4 rounded-lg text-sm font-medium ${
            resultMsg.type === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {resultMsg.text}
        </div>
      )}

      <form onSubmit={handlePickSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            เลขที่ใบสั่งขาย / ใบเบิก (Outbound Order No.)
          </label>
          <input
            value={outboundDocNo}
            onChange={(e) => setOutboundDocNo(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            1. สแกนบาร์โค้ดชั้นวางที่เดินไปหยิบ (Location Barcode)
          </label>
          <input
            value={locationBarcode}
            onChange={(e) => setLocationBarcode(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            2. สแกนหมายเลขเครื่องบนตัวสินค้า (Serial Number)
          </label>
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="เช่น SN2610-0001"
            className="w-full border-2 border-emerald-500 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none"
            autoFocus
          />
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-600 text-white py-3 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition"
        >
          ยืนยันการหยิบและตัดสต็อก
        </button>
      </form>
    </div>
  );
}
