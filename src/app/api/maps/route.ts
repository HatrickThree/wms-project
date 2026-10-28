import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
import {
  mapData,
  saveMap,
  generateMap,
  createPickingPlan,
} from "@/services/warehouse-map.service";
export async function GET(request: Request) {
  return apiHandler(async () =>
    NextResponse.json({
      success: true,
      data: await mapData(
        await workspaceAccessForRequest(request),
        new URL(request.url).searchParams.get("warehouseId"),
      ),
    }),
  );
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const body = await request.json();
    const data =
      body.action === "save"
        ? await saveMap(body, access)
        : body.action === "suggest"
          ? await generateMap(body, access)
          : body.action === "route"
            ? await createPickingPlan(body, access)
            : null;
    if (!data) throw new HttpError(400, "ไม่พบคำสั่งผังคลัง");
    return NextResponse.json({ success: true, data });
  });
}
