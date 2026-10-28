import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  HttpError,
  requireAdmin,
  verifyPassword,
  type WorkspaceAccess,
} from "@/lib/auth";
import { OperationKeySchema } from "@/lib/validations/stock.schema";
import { stockOperation } from "./stock-operation";
import { workspaceDeletion } from "@/lib/workspace-state";

async function reauthenticateAdmin(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, passwordHash: true, role: true, disabled: true },
  });
  if (!user || user.disabled || user.role !== "ADMIN")
    throw new HttpError(403, "เฉพาะผู้ดูแลระบบที่ลบพื้นที่ได้");
  const attempt = await prisma.loginAttempt.findUnique({
      where: { username: user.username },
    }),
    now = new Date();
  if (attempt?.lockedUntil && attempt.lockedUntil > now)
    throw new HttpError(
      429,
      "กรอกรหัสผ่านผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่",
    );
  if (!(await verifyPassword(password, user.passwordHash))) {
    const stale =
      !attempt || now.getTime() - attempt.updatedAt.getTime() > 15 * 60 * 1000;
    const result = await prisma.loginAttempt.upsert({
      where: { username: user.username },
      create: { username: user.username, failures: 1 },
      update: { failures: stale ? 1 : { increment: 1 }, lockedUntil: null },
    });
    if (result.failures >= 5)
      await prisma.loginAttempt.update({
        where: { username: user.username },
        data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
      });
    throw new HttpError(400, "รหัสผ่านของผู้ดูแลไม่ถูกต้อง ยังไม่ได้ลบพื้นที่");
  }
  await prisma.loginAttempt.deleteMany({ where: { username: user.username } });
}
const CommandSchema = z.object({
  operationId: OperationKeySchema,
  confirmName: z.string().min(1).max(100),
});
export async function changeWorkspaceState(
  id: string,
  raw: unknown,
  action: "delete" | "restore",
) {
  const session = await requireAdmin();
  const input = (
    action === "delete"
      ? CommandSchema.extend({
          password: z
            .string()
            .min(1, "กรอกรหัสผ่านบัญชีของคุณเพื่อยืนยัน")
            .max(200),
        })
      : CommandSchema.extend({ deletedAt: z.string().datetime() })
  ).parse(raw);
  if (action === "delete")
    await reauthenticateAdmin(
      session.user.id,
      (input as { password: string }).password,
    );
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) throw new HttpError(404, "ไม่พบพื้นที่นี้");
  const access: WorkspaceAccess = {
    user: session.user,
    workspace,
    sessionId: session.id,
    trainingRound: null,
  };
  // Never persist the password in operation payloads, audit records, or results.
  const payload = {
    type: `workspace.${action}`,
    confirmName: input.confirmName,
    ...(action === "restore"
      ? { deletedAt: (input as { deletedAt: string }).deletedAt }
      : {}),
  };
  return stockOperation(access, input.operationId, payload, async (tx) => {
    const current = await tx.workspace.findUniqueOrThrow({ where: { id } });
    const deletion = await workspaceDeletion(id, tx);
    if (current.name !== input.confirmName)
      throw new HttpError(409, "ชื่อพื้นที่ไม่ตรง กรุณาตรวจชื่อและยืนยันใหม่");
    if (action === "delete") {
      if (!deletion)
        await tx.$executeRaw`INSERT INTO "WorkspaceDeletion" ("workspaceId","deletedAt","deletedBy") VALUES (${id},${new Date()},${session.user.username})`;
      await tx.userSession.updateMany({
        where: { activeWorkspaceId: id },
        data: { activeWorkspaceId: null },
      });
      return {
        message:
          "ลบพื้นที่ออกจากการใช้งานแล้ว ข้อมูลยังอยู่และผู้ดูแลกู้คืนได้",
        deleted: true,
      };
    }
    if (
      !deletion ||
      deletion.deletedAt.toISOString() !==
        (input as { deletedAt: string }).deletedAt
    )
      throw new HttpError(
        409,
        "สถานะพื้นที่เปลี่ยนไปแล้ว โหลดรายการล่าสุดก่อนกู้คืน",
      );
    await tx.$executeRaw`DELETE FROM "WorkspaceDeletion" WHERE "workspaceId"=${id}`;
    return {
      message: "กู้คืนพื้นที่แล้ว สมาชิกเดิมเลือกพื้นที่นี้เพื่อใช้งานต่อได้",
      deleted: false,
    };
  });
}
