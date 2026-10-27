import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { LabelKindSchema } from "@/lib/labels";

const QuerySchema = z.object({
  kind: LabelKindSchema.default("location"),
  keyword: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success)
      return NextResponse.json(
        {
          success: false,
          error: "ตัวเลือกประเภทป้าย คำค้น หรือเลขหน้าไม่ถูกต้อง",
        },
        { status: 400 },
      );
    const { kind, keyword, page, pageSize } = parsed.data;
    const pagination = { skip: (page - 1) * pageSize, take: pageSize };
    try {
      if (kind === "location") {
        const where = {
          workspaceId: access.workspace.id,
          ...(keyword
            ? {
                OR: [
                  { barcode: { contains: keyword } },
                  { zone: { contains: keyword } },
                  { warehouse: { name: { contains: keyword } } },
                ],
              }
            : {}),
        };
        const [items, total] = await prisma.$transaction([
          prisma.location.findMany({
            where,
            ...pagination,
            orderBy: { barcode: "asc" },
            include: { warehouse: true },
          }),
          prisma.location.count({ where }),
        ]);
        return NextResponse.json({
          success: true,
          data: {
            items: items.map((item) => ({
              id: item.id,
              code: item.barcode,
              title: item.warehouse.name,
              description: `โซน ${item.zone} · แถว ${item.aisle} · ชั้น ${item.level}`,
            })),
            total,
            page,
            pageSize,
          },
        });
      }
      if (kind === "product") {
        const where = {
          workspaceId: access.workspace.id,
          ...(keyword
            ? {
                OR: [
                  { sku: { contains: keyword } },
                  { name: { contains: keyword } },
                  { barcode: { contains: keyword } },
                ],
              }
            : {}),
        };
        const [items, total] = await prisma.$transaction([
          prisma.product.findMany({
            where,
            ...pagination,
            orderBy: { sku: "asc" },
          }),
          prisma.product.count({ where }),
        ]);
        return NextResponse.json({
          success: true,
          data: {
            items: items.map((item) => ({
              id: item.id,
              code: item.sku,
              title: item.name,
              description: `${item.category || "ทั่วไป"} · หน่วย ${item.baseUom}`,
            })),
            total,
            page,
            pageSize,
          },
        });
      }
      const where = {
        workspaceId: access.workspace.id,
        ...(keyword
          ? {
              OR: [
                { serialNumber: { contains: keyword } },
                { product: { sku: { contains: keyword } } },
              ],
            }
          : {}),
      };
      const [items, total] = await prisma.$transaction([
        prisma.serialItem.findMany({
          where,
          ...pagination,
          orderBy: { serialNumber: "asc" },
          include: { product: true, location: true },
        }),
        prisma.serialItem.count({ where }),
      ]);
      return NextResponse.json({
        success: true,
        data: {
          items: items.map((item) => ({
            id: item.id,
            code: item.serialNumber,
            title: item.product.name,
            description: `${item.product.sku} · ${item.location?.barcode || "ไม่ระบุตำแหน่ง"}`,
          })),
          total,
          page,
          pageSize,
        },
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "โหลดรายการสำหรับสร้างป้ายไม่ได้ กรุณาลองใหม่",
        },
        { status: 500 },
      );
    }
  });
}
