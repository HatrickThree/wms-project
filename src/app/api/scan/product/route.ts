import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const parsed = z
      .string()
      .trim()
      .min(1)
      .max(256)
      .safeParse(new URL(request.url).searchParams.get("code"));
    if (!parsed.success)
      return NextResponse.json(
        {
          success: false,
          error: "กรุณาสแกนหรือระบุรหัสสินค้าไม่เกิน 256 ตัวอักษร",
        },
        { status: 400 },
      );
    try {
      const products = await prisma.product.findMany({
        where: {
          workspaceId: access.workspace.id,
          OR: [{ sku: parsed.data }, { barcode: parsed.data }],
        },
        include: {
          units: { where: { active: true }, orderBy: { factor: "asc" } },
        },
        take: 2,
      });
      if (!products.length)
        return NextResponse.json(
          {
            success: false,
            error:
              "ไม่พบสินค้าที่ตรงกับ SKU หรือบาร์โค้ดนี้ กรุณาตรวจป้ายหรือกรอก SKU เอง",
          },
          { status: 404 },
        );
      if (products.length > 1)
        return NextResponse.json(
          {
            success: false,
            error:
              "รหัสนี้ตรงกับสินค้ามากกว่าหนึ่งรายการ กรุณาตรวจข้อมูลหลักและกรอก SKU ที่ต้องการเอง",
          },
          { status: 409 },
        );
      return NextResponse.json({ success: true, data: products[0] });
    } catch {
      return NextResponse.json(
        { success: false, error: "ยังตรวจสอบรหัสสินค้าไม่ได้ กรุณาลองใหม่" },
        { status: 500 },
      );
    }
  });
}
