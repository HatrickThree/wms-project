import { NextResponse } from "next/server";
import { WmsService } from "@/services/wms.service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await WmsService.receiveSerializedStock(body);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการรับสินค้าเข้าคลัง";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
