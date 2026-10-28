import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/auth";
export async function requireUnlockedProducts(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  productIds: string[],
) {
  const locked = await tx.countRun.findFirst({
    where: {
      workspaceId,
      productId: { in: productIds },
      mode: "LOCK",
      status: { in: ["OPEN", "SUBMITTED"] },
    },
    select: { number: true },
  });
  if (locked)
    throw new HttpError(
      409,
      `สินค้านี้หยุดทำรายการระหว่างตรวจนับ ${locked.number} กรุณาปิดงานนับก่อน`,
    );
}
