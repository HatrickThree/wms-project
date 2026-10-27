import { NextResponse } from "next/server";
import { WmsService } from "@/services/wms.service";
import { InventorySearchSchema } from "@/lib/validations/wms.schema";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const filters = InventorySearchSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const data = await WmsService.searchWarehouseInventory(filters, access);
    return NextResponse.json({ success: true, data });
  });
}
