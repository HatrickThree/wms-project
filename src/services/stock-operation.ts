import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";

export function businessToday(now = new Date()) { return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10); }

// Persist the command and result with stock changes, so lost responses can be retried safely.
export async function stockOperation<T>(access: WorkspaceAccess, key: string, payload: unknown, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const existing = await prisma.stockOperation.findUnique({ where: { workspaceId_key: { workspaceId: access.workspace.id, key } } });
  const read = (row: { payloadHash: string; resultJson: string }) => {
    if (row.payloadHash !== payloadHash) throw new HttpError(409, "รหัสรายการนี้ใช้กับข้อมูลอื่นแล้ว กรุณาสร้างรายการใหม่");
    return JSON.parse(row.resultJson) as T;
  };
  if (existing) return read(existing);
  try {
    return await prisma.$transaction(async tx => {
      const repeated = await tx.stockOperation.findUnique({ where: { workspaceId_key: { workspaceId: access.workspace.id, key } } });
      if (repeated) return read(repeated);
      const result = await action(tx);
      await tx.stockOperation.create({ data: { workspaceId: access.workspace.id, key, payloadHash, resultJson: JSON.stringify(result) } });
      return result;
    }, { maxWait: 10_000, timeout: 20_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) {
      const completed = await prisma.stockOperation.findUnique({ where: { workspaceId_key: { workspaceId: access.workspace.id, key } } });
      if (completed) return read(completed);
      if (error.code !== "P2002") throw new HttpError(409, "มีรายการอื่นกำลังใช้สต็อกนี้ กรุณาตรวจข้อมูลล่าสุดแล้วลองรายการเดิมอีกครั้ง");
    }
    throw error;
  }
}
