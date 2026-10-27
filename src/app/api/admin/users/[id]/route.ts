import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  hashPassword,
  HttpError,
  requireAdmin,
  requireSameOrigin,
  SESSION_COOKIE,
} from "@/lib/auth";
import { PasswordSchema } from "@/lib/validations/auth.schema";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const session = await requireAdmin();
    const input = z
      .object({
        disabled: z.boolean().optional(),
        password: PasswordSchema.optional(),
      })
      .refine(
        (value) => value.disabled !== undefined || !!value.password,
        "กรุณาระบุการเปลี่ยนแปลง",
      )
      .parse(await request.json());
    const id = (await params).id;
    const passwordHash = input.password
      ? await hashPassword(input.password)
      : undefined;
    const target = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new HttpError(404, "ไม่พบบัญชีนี้");
      if (
        user.role === "ADMIN" &&
        input.disabled &&
        !user.disabled &&
        (await tx.user.count({ where: { role: "ADMIN", disabled: false } })) <=
          1
      )
        throw new HttpError(
          400,
          "ไม่สามารถปิดบัญชีผู้ดูแลที่ใช้งานได้คนสุดท้าย",
        );
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.disabled !== undefined ? { disabled: input.disabled } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
        select: { id: true, disabled: true },
      });
      if (input.disabled || passwordHash)
        await tx.userSession.deleteMany({ where: { userId: id } });
      return updated;
    });
    const signedOut =
      target.id === session.user.id && (!!input.disabled || !!passwordHash);
    if (signedOut) (await cookies()).delete(SESSION_COOKIE);
    return NextResponse.json({ success: true, data: { ...target, signedOut } });
  });
}
