import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireMasterDataAccess } from "@/lib/warehouse-permissions";
import { ProductSchema, WarehouseSchema, LocationSchema } from "@/lib/validations/stock.schema";
import { z } from "zod";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const { workspace } = await workspaceAccessForRequest(request);
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0,100) || "";
    const where = { workspaceId: workspace.id };
    const productWhere = { ...where, ...(q ? { OR: [{ sku: { contains: q } }, { name: { contains: q } }, { barcode: { contains: q } }] } : {}) };
    const locationWhere = { ...where, ...(q ? { barcode: { contains: q } } : {}) };
    const [products, warehouses, locations, productCount, locationCount] = await Promise.all([
      prisma.product.findMany({ where: productWhere, take: 200, orderBy: { sku: "asc" } }),
      prisma.warehouse.findMany({ where, take: 200, orderBy: { code: "asc" } }),
      prisma.location.findMany({ where: locationWhere, take: 200, include: { warehouse: true }, orderBy: { barcode: "asc" } }),
      prisma.product.count({ where: productWhere }), prisma.location.count({ where: locationWhere }),
    ]);
    return NextResponse.json({ success: true, data: { products, warehouses, locations, productCount, locationCount, limit: 200 } });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request); requireMasterDataAccess(access);
    const raw = await request.json(); const { kind } = z.object({ kind: z.enum(["product", "warehouse", "location"]) }).parse(raw);
    const workspaceId = access.workspace.id;
    if (kind === "product") return NextResponse.json({ success: true, data: await prisma.product.create({ data: { ...ProductSchema.parse(raw), workspaceId } }) }, { status: 201 });
    if (kind === "warehouse") return NextResponse.json({ success: true, data: await prisma.warehouse.create({ data: { ...WarehouseSchema.parse(raw), workspaceId } }) }, { status: 201 });
    const input = LocationSchema.parse(raw);
    if (!(await prisma.warehouse.findFirst({ where: { id: input.warehouseId, workspaceId } }))) throw new HttpError(400, "ไม่พบคลังในพื้นที่ปัจจุบัน");
    return NextResponse.json({ success: true, data: await prisma.location.create({ data: { ...input, workspaceId } }) }, { status: 201 });
  });
}
export async function PATCH(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request); requireMasterDataAccess(access);
    const raw = await request.json(); const { id } = z.object({ id: z.string().min(1) }).parse(raw); const data = ProductSchema.parse(raw);
    const product = await prisma.$transaction(async tx => {
      const current = await tx.product.findFirst({ where: { id, workspaceId: access.workspace.id } });
      if (!current) throw new HttpError(404, "ไม่พบสินค้าในพื้นที่นี้");
      const used = await tx.stockLedger.count({ where: { productId: id } });
      if (used && (data.trackSerial !== current.trackSerial || data.sku !== current.sku || data.barcode !== current.barcode || data.baseUom !== current.baseUom)) throw new HttpError(400, "สินค้ามีประวัติแล้ว เปลี่ยน SKU บาร์โค้ด หน่วยหลัก หรือวิธีควบคุม Serial ไม่ได้");
      if ((data.trackLot || data.issuePolicy === "FEFO") && await tx.stockLayer.count({ where: { productId: id, qtyOnHand: { gt: 0 }, OR: [{ lotId: null }, ...(data.issuePolicy === "FEFO" ? [{ lot: { expiresOn: null } }] : [])] } })) throw new HttpError(400, "มีสต็อกเดิมที่ยังไม่มี Lot/วันหมดอายุ กรุณาตรวจสอบก่อนเปลี่ยนวิธีควบคุม");
      return tx.product.update({ where: { id }, data });
    });
    return NextResponse.json({ success: true, data: product });
  });
}
