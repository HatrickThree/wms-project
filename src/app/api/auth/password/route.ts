import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  hashPassword,
  HttpError,
  requireSameOrigin,
  requireSession,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { PasswordSchema } from "@/lib/validations/auth.schema";
export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const session = await requireSession();
    const input = z
      .object({
        currentPassword: z.string().min(1).max(128),
        password: PasswordSchema,
      })
      .parse(await request.json());
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (
      !user ||
      !(await verifyPassword(input.currentPassword, user.passwordHash))
    )
      throw new HttpError(400, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordHash: user.passwordHash,
          disabled: false,
        },
        data: { passwordHash },
      });
      if (updated.count !== 1)
        throw new HttpError(409, "บัญชีเปลี่ยนไปแล้ว กรุณาเข้าสู่ระบบใหม่");
      await tx.userSession.deleteMany({ where: { userId: user.id } });
    });
    (await cookies()).delete(SESSION_COOKIE);
    return NextResponse.json({ success: true, data: { next: "/login" } });
  });
}
