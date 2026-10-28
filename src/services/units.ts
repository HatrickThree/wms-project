import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/auth";
export async function convertToBase(
  tx: Prisma.TransactionClient,
  product: { id: string; workspaceId: string; baseUom: string },
  quantity: number,
  unitId?: string,
) {
  const unit = unitId
    ? await tx.productUnit.findFirst({
        where: {
          id: unitId,
          productId: product.id,
          workspaceId: product.workspaceId,
          active: true,
        },
      })
    : null;
  if (unitId && !unit)
    throw new HttpError(400, "หน่วยไม่ตรงกับสินค้าหรือปิดใช้งานแล้ว");
  const factor = unit?.factor || 1;
  const baseQuantity = quantity * factor;
  if (!Number.isSafeInteger(baseQuantity) || baseQuantity > 1_000_000)
    throw new HttpError(
      400,
      "จำนวนหลังแปลงหน่วยต้องไม่เกิน 1,000,000 หน่วยหลัก",
    );
  return { baseQuantity, factor, name: unit?.name || product.baseUom };
}
