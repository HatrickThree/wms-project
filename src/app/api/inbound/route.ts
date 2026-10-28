import { NextResponse } from "next/server";
import { receiveStock } from "@/services/receiving.service";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const data = await receiveStock(await request.json(), access);
    return NextResponse.json({ success: true, data });
  });
}
