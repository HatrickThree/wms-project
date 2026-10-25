"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface SerialItemRecord {
  id: string;
  serialNumber: string;
  status: string;
  lotNumber: string | null;
  inboundDocNo: string;
  outboundDocNo: string | null;
  receivedAt: string;
  shippedAt: string | null;
  product: {
    sku: string;
    name: string;
    barcode: string;
    category: string | null;
  };
  location: {
    barcode: string;
    zone: string;
    aisle: string;
    rack: string;
    level: string;
    type: string;
  } | null;
}

interface GroupedLocationSummary {
  sku: string;
  productName: string;
  category: string;
  locationBarcode: string;
  zone: string;
  locationType: string;
  inStockCount: number;
  totalMatchedCount: number;
  serialNumbers: Array<{
    serialNumber: string;
    status: string;
    lotNumber: string | null;
    inboundDocNo: string;
    receivedAt: string;
  }>;
}

interface FilterOptions {
  categories: string[];
  zones: string[];
  locationBarcodes: string[];
}

export default function WarehouseInventorySearchPage() {
  // สถานะตัวกรองทั้งหมดสำหรับการค้นหากรณีไม่ทราบหมายเลข Serial Number
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("ALL");
  const [zone, setZone] = useState("ALL");
  const [locationBarcode, setLocationBarcode] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [docNo, setDocNo] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // โหมดการแสดงผล: "SUMMARY" (สรุปตามสินค้า+ชั้นวาง แล้วกดกางดู S/N) หรือ "SERIAL_LIST" (ตารางรายการ S/N ทั้งหมด)
  const [viewMode, setViewMode] = useState<"SUMMARY" | "SERIAL_LIST">("SUMMARY");
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  const [serialItems, setSerialItems] = useState<SerialItemRecord[]>([]);
  const [groupedSummary, setGroupedSummary] = useState<GroupedLocationSummary[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    categories: [],
    zones: [],
    locationBarcodes: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (category !== "ALL") params.set("category", category);
      if (zone !== "ALL") params.set("zone", zone);
      if (locationBarcode !== "ALL") params.set("locationBarcode", locationBarcode);
      if (status !== "ALL") params.set("status", status);
      if (docNo.trim()) params.set("docNo", docNo.trim());
      if (lotNumber.trim()) params.set("lotNumber", lotNumber.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/inventory?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "ไม่สามารถโหลดข้อมูลคลังสินค้าได้");
      } else {
        setSerialItems(json.data.serialItems);
        setGroupedSummary(json.data.groupedSummary);
        setFilterOptions(json.data.filterOptions);
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบว่าได้รัน npm run db:setup แล้ว");
    } finally {
      setLoading(false);
    }
  }, [keyword, category, zone, locationBarcode, status, docNo, lotNumber, dateFrom, dateTo]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleResetFilters = () => {
    setKeyword("");
    setCategory("ALL");
    setZone("ALL");
    setLocationBarcode("ALL");
    setStatus("ALL");
    setDocNo("");
    setLotNumber("");
    setDateFrom("");
    setDateTo("");
  };

  const statusBadgeClass = (st: string) => {
    switch (st) {
      case "IN_STOCK":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "ALLOCATED":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "SHIPPED":
        return "bg-slate-200 text-slate-700 border-slate-300";
      case "RETURNED":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "DEFECTIVE":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            ค้นหาสต็อกคลังสินค้า & ค้นหาแบบไม่รู้ Serial Number
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            กรองหาสินค้าและหมายเลขเครื่อง (S/N) จากชื่อรุ่น, หมวดหมู่, โซน, ชั้นวาง, เลขที่ใบรับของ/ใบเบิก, Lot หรือวันที่รับเข้าคลัง
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("SUMMARY")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
              viewMode === "SUMMARY"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            มุมมองสรุปตามชั้นวาง ({groupedSummary.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("SERIAL_LIST")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border transition ${
              viewMode === "SERIAL_LIST"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            มุมมองรายการ S/N รายชิ้น ({serialItems.length})
          </button>
        </div>
      </div>

      {/* Multi-Filter Search Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Keyword Search */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              คำค้นหาทั่วไป (ชื่อสินค้า / SKU / บาร์โค้ด / บางส่วนของ S/N)
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="พิมพ์เช่น SCAN-PRO, Wireless, A-01 หรือเลขท้าย S/N เช่น 0002..."
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              หมวดหมู่สินค้า (Category)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="ALL">-- ทุกหมวดหมู่ --</option>
              {filterOptions.categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Serial Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              สถานะสินค้า (Serial Status)
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="ALL">-- ทุกสถานะ --</option>
              <option value="IN_STOCK">IN_STOCK (พร้อมขายในคลัง)</option>
              <option value="ALLOCATED">ALLOCATED (จองแล้วรอหยิบ)</option>
              <option value="SHIPPED">SHIPPED (ส่งออกแล้ว)</option>
              <option value="RETURNED">RETURNED (รับคืน/รอตรวจสอบ)</option>
              <option value="DEFECTIVE">DEFECTIVE (ชำรุด)</option>
            </select>
          </div>
        </div>

        {/* Second Row of Advanced Filters (When user doesn't know S/N) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          {/* Zone Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              โซนคลังสินค้า (Zone)
            </label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white"
            >
              <option value="ALL">-- ทุกโซน --</option>
              {filterOptions.zones.map((z) => (
                <option key={z} value={z}>
                  โซน {z}
                </option>
              ))}
            </select>
          </div>

          {/* Bin Location Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              ชั้นวาง (Bin Location)
            </label>
            <select
              value={locationBarcode}
              onChange={(e) => setLocationBarcode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white font-mono"
            >
              <option value="ALL">-- ทุกชั้นวาง --</option>
              {filterOptions.locationBarcodes.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Document Number Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              เลขที่ใบรับ/ใบเบิก (GRN / SO)
            </label>
            <input
              type="text"
              value={docNo}
              onChange={(e) => setDocNo(e.target.value)}
              placeholder="เช่น GRN-202610-001"
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono"
            />
          </div>

          {/* Lot Number Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              หมายเลขล็อต (Lot Number)
            </label>
            <input
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="เช่น LOT-2026-10A"
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono"
            />
          </div>

          {/* Received Date From */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              วันที่รับเข้า (ตั้งแต่)
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
            />
          </div>

          {/* Received Date To */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              วันที่รับเข้า (ถึง)
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Filter Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-xs text-slate-500">
            พบทั้งหมด{" "}
            <span className="font-bold text-slate-900">{serialItems.length}</span> หมายเลขเครื่อง
            (จาก{" "}
            <span className="font-bold text-slate-900">{groupedSummary.length}</span> พิกัดชั้นวาง)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              ล้างตัวกรองทั้งหมด
            </button>
            <button
              type="button"
              onClick={fetchInventory}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              ค้นหาข้อมูล
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Results View 1: Grouped by SKU & Bin Location (with expandable S/N list) */}
      {!loading && viewMode === "SUMMARY" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800">
              ตารางสรุปยอดคงเหลือแยกตามสินค้าและพิกัดชั้นวาง (คลิกที่แถวเพื่อดูรายการ S/N ภายในชั้นวาง)
            </h3>
          </div>
          {groupedSummary.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              ไม่พบรายการสินค้าที่ตรงกับเงื่อนไขการกรอง
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {groupedSummary.map((group) => {
                const groupKey = `${group.sku}@@${group.locationBarcode}`;
                const isExpanded = expandedGroupKey === groupKey;
                return (
                  <div key={groupKey} className="transition">
                    <div
                      onClick={() =>
                        setExpandedGroupKey(isExpanded ? null : groupKey)
                      }
                      className="p-4 hover:bg-slate-50 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                            {group.sku}
                          </span>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {group.category}
                          </span>
                          <span className="font-semibold text-sm text-slate-900">
                            {group.productName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-4">
                          <span>
                            โซน: <strong className="text-slate-800">{group.zone}</strong>
                          </span>
                          <span>
                            ชั้นวาง:{" "}
                            <strong className="font-mono text-slate-900">
                              {group.locationBarcode}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-xs text-slate-500 block">พร้อมขาย (IN_STOCK)</span>
                          <span className="text-base font-bold text-emerald-600">
                            {group.inStockCount} ชิ้น
                          </span>
                          <span className="text-xs text-slate-400 ml-1">
                            (รวมทุกสถานะ {group.totalMatchedCount})
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-blue-600 underline">
                          {isExpanded ? "ซ่อนรายการ S/N ▲" : "ดูรายการ S/N ▼"}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-slate-50 px-5 py-4 border-t border-slate-200">
                        <p className="text-xs font-semibold text-slate-700 mb-2">
                          หมายเลข Serial Number ที่พบในพิกัดนี้ ({group.serialNumbers.length} รายการ):
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {group.serialNumbers.map((snItem) => (
                            <div
                              key={snItem.serialNumber}
                              className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between text-xs"
                            >
                              <div>
                                <p className="font-mono font-bold text-slate-900">
                                  {snItem.serialNumber}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  ใบรับ: {snItem.inboundDocNo} | Lot: {snItem.lotNumber ?? "-"}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadgeClass(
                                    snItem.status
                                  )}`}
                                >
                                  {snItem.status}
                                </span>
                                <Link
                                  href={`/serials?sn=${encodeURIComponent(snItem.serialNumber)}`}
                                  className="text-[11px] text-blue-600 hover:underline font-medium"
                                >
                                  ดูประวัติ →
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Results View 2: Flat Serial Number Table (for finding unknown S/N directly) */}
      {!loading && viewMode === "SERIAL_LIST" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Serial Number (S/N)</th>
                <th className="py-3 px-4">รหัส SKU / ชื่อสินค้า</th>
                <th className="py-3 px-4">สถานะ</th>
                <th className="py-3 px-4">โซน / ชั้นวางปัจจุบัน</th>
                <th className="py-3 px-4">Lot Number</th>
                <th className="py-3 px-4">เอกสารรับเข้า / เบิกออก</th>
                <th className="py-3 px-4">วันที่รับเข้า</th>
                <th className="py-3 px-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {serialItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    ไม่พบหมายเลข Serial Number ที่ตรงกับตัวกรอง
                  </td>
                </tr>
              ) : (
                serialItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.serialNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-blue-700 block">
                        {item.product.sku}
                      </span>
                      <span className="text-slate-600">{item.product.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusBadgeClass(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {item.location ? (
                        <>
                          <span className="font-bold text-slate-900">
                            {item.location.barcode}
                          </span>
                          <span className="text-slate-500 block text-[11px]">
                            โซน {item.location.zone}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">ออกจากคลังแล้ว</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {item.lotNumber ?? "-"}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="block text-slate-800">รับ: {item.inboundDocNo}</span>
                      {item.outboundDocNo && (
                        <span className="block text-slate-500">
                          จ่าย: {item.outboundDocNo}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(item.receivedAt).toLocaleDateString("th-TH")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/serials?sn=${encodeURIComponent(item.serialNumber)}`}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        ตรวจสอบประวัติ →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
