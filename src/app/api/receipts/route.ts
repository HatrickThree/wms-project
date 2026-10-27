import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { receiveStock } from "@/services/receiving.service";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    return NextResponse.json({ success: true, data: await receiveStock(await request.json(), access) });
  });
}
