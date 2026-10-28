import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
import { requireMasterDataAccess } from "@/lib/warehouse-permissions";
import { prisma } from "@/lib/db";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    requireMasterDataAccess(access);
    const data = z
      .object({
        productId: z.string().min(1),
        name: z.string().trim().min(1).max(20),
        factor: z.number().int().min(1).max(1_000_000),
      })
      .parse(await request.json());
    const product = await prisma.product.findFirst({
      where: { id: data.productId, workspaceId: access.workspace.id },
    });
    if (!product) throw new HttpError(404, "ไม่พบสินค้าในพื้นที่นี้");
    if (data.name === product.baseUom)
      throw new HttpError(400, "หน่วยหลักมีอัตรา 1 อยู่แล้ว");
    return NextResponse.json(
      {
        success: true,
        data: await prisma.productUnit.create({
          data: { ...data, workspaceId: access.workspace.id },
        }),
      },
      { status: 201 },
    );
  });
}
