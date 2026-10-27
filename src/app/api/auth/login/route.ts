import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  HttpError,
  openSession,
  requireSameOrigin,
  verifyPassword,
  workspaceVisibility,
} from "@/lib/auth";
import { LoginSchema } from "@/lib/validations/auth.schema";

export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const input = LoginSchema.parse(await request.json());
    const now = new Date();
    const attempt = await prisma.loginAttempt.findUnique({
      where: { username: input.username },
    });
    if (attempt?.lockedUntil && attempt.lockedUntil > now)
      throw new HttpError(
        429,
        "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่",
      );
    const user = await prisma.user.findUnique({
      where: { username: input.username },
    });
    const correct = await verifyPassword(input.password, user?.passwordHash);
    if (!correct || !user || user.disabled) {
      const stale =
        !attempt ||
        now.getTime() - attempt.updatedAt.getTime() > 15 * 60 * 1000;
      const updated = await prisma.loginAttempt.upsert({
        where: { username: input.username },
        create: { username: input.username, failures: 1 },
        update: { failures: stale ? 1 : { increment: 1 }, lockedUntil: null },
      });
      if (updated.failures >= 5)
        await prisma.loginAttempt.update({
          where: { username: input.username },
          data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
        });
      throw new HttpError(
        401,
        "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่พร้อมใช้งาน",
      );
    }
    await prisma.loginAttempt.deleteMany({
      where: { username: user.username },
    });
    const workspace = await prisma.workspace.findFirst({
      where: workspaceVisibility(user),
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    await openSession(user.id, workspace?.id || null, request);
    return NextResponse.json({
      success: true,
      data: { next: workspace ? "/" : "/workspaces" },
    });
  });
}
