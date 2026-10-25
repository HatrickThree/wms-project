import { NextResponse } from "next/server";
import { WmsService } from "@/services/wms.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      keyword: searchParams.get("keyword") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      zone: searchParams.get("zone") ?? undefined,
      locationBarcode: searchParams.get("locationBarcode") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      docNo: searchParams.get("docNo") ?? undefined,
      lotNumber: searchParams.get("lotNumber") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };

    const result = await WmsService.searchWarehouseInventory(filters);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการค้นหาข้อมูลคลังสินค้า";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
