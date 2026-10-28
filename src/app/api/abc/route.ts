import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
import {
  abcData,
  saveABCSettings,
  analyzeABC,
  confirmABC,
} from "@/services/abc.service";
export async function GET(request: Request) {
  return apiHandler(async () =>
    NextResponse.json({
      success: true,
      data: await abcData(
        await workspaceAccessForRequest(request),
        new URL(request.url).searchParams,
      ),
    }),
  );
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const body = await request.json();
    const data =
      body.action === "settings"
        ? await saveABCSettings(body, access)
        : body.action === "analyze"
          ? await analyzeABC(body, access)
          : body.action === "confirm"
            ? await confirmABC(body, access)
            : null;
    if (!data) throw new HttpError(400, "ไม่พบคำสั่ง ABC นี้");
    return NextResponse.json({ success: true, data });
  });
}
