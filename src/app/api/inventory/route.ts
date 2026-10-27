import { NextResponse } from "next/server";
import { WmsService } from "@/services/wms.service";
import { InventorySearchSchema } from "@/lib/validations/wms.schema";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = InventorySearchSchema.safeParse(
      Object.fromEntries(searchParams),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const result = await WmsService.searchWarehouseInventory(parsed.data);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "เกิดข้อผิดพลาดในการค้นหาข้อมูลคลังสินค้า";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
