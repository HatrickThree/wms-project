import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { businessToday } from "@/services/stock-operation";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const { workspace } = await workspaceAccessForRequest(request);
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim().slice(0,100) || "";
    const where = { workspaceId: workspace.id, qtyOnHand: { gt: 0 }, ...(params.get("productId") ? { productId: params.get("productId")! } : {}), ...(q ? { OR: [{ product: { sku: { contains: q } } }, { product: { name: { contains: q } } }, { location: { barcode: { contains: q } } }, { lot: { number: { contains: q } } }] } : {}) };
    const [layers, count, totals] = await Promise.all([
      prisma.stockLayer.findMany({ where, include: { product: true, location: true, lot: true, serials: { where: { status: { in: ["IN_STOCK", "ALLOCATED", "PICKED", "DEFECTIVE", "RETURNED"] } }, select: { id: true, serialNumber: true, status: true }, take: 500 } }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 200 }),
      prisma.stockLayer.count({ where }), prisma.stockLayer.aggregate({ where, _sum: { qtyOnHand: true, qtyAllocated: true } }),
    ]);
    return NextResponse.json({ success: true, data: { layers, count, totals: totals._sum, limit: 200, today: businessToday() } });
  });
}
