import { NextResponse } from "next/server";
import { WmsService } from "@/services/wms.service";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const data = await WmsService.pickSerializedStock(
      await request.json(),
      access,
    );
    return NextResponse.json({ success: true, data });
  });
}
