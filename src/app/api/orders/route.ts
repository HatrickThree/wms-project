import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { getOrders, createOrder } from "@/services/orders.service";
export async function GET(request: Request) {
  return apiHandler(async () =>
    NextResponse.json({
      success: true,
      data: await getOrders(await workspaceAccessForRequest(request)),
    }),
  );
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    return NextResponse.json(
      { success: true, data: await createOrder(await request.json(), access) },
      { status: 201 },
    );
  });
}
