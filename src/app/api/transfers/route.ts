import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { transferStock } from "@/services/transfers.service";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    return NextResponse.json({
      success: true,
      data: await transferStock(await request.json(), access),
    });
  });
}
