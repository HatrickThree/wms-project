import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { actOnOrder } from "@/services/orders.service";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    return NextResponse.json({
      success: true,
      data: await actOnOrder((await params).id, await request.json(), access),
    });
  });
}
