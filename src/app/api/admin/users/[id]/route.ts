import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  hashPassword,
  HttpError,
  requireAdmin,
  SESSION_COOKIE,
} from "@/lib/auth";
import { PasswordSchema } from "@/lib/validations/auth.schema";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const session = await requireAdmin();
    const id = (await params).id;
    const input = z
      .union([
        z.object({ restore: z.literal(true) }).strict(),
        z
          .object({
            disabled: z.boolean().optional(),
            password: PasswordSchema.optional(),
          })
          .strict()
          .refine(
            (value) => value.disabled !== undefined || !!value.password,
            "กรุณาระบุการเปลี่ยนแปลง",
          ),
      ])
      .parse(await request.json());
    if ("restore" in input) {
      const restored = await prisma.user.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (!restored.count)
        throw new HttpError(409, "บัญชีนี้ไม่ได้อยู่ในรายการที่ลบแล้ว");
      return NextResponse.json({
        success: true,
        data: { id, signedOut: false },
      });
    }
    const passwordHash = input.password
      ? await hashPassword(input.password)
      : undefined;
    const target = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new HttpError(404, "ไม่พบบัญชีนี้");
      if (user.deletedAt)
        throw new HttpError(409, "กู้คืนบัญชีก่อนเปลี่ยนสถานะหรือรหัสผ่าน");
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const session = await requireAdmin();
    const { id } = await params;
    if (id === session.user.id)
      throw new HttpError(400, "ไม่สามารถลบบัญชีที่กำลังใช้เข้าสู่ระบบ");
    const { confirmUsername } = z
      .object({
        confirmUsername: z.string().min(1).max(40),
      })
      .parse(await request.json());

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { username: true, role: true, disabled: true, deletedAt: true },
      });
      if (!user) throw new HttpError(404, "ไม่พบบัญชีนี้");
      if (confirmUsername !== user.username)
        throw new HttpError(409, "ชื่อผู้ใช้ไม่ตรงกับบัญชีที่จะลบ");
      if (user.deletedAt) return;
      if (
        user.role === "ADMIN" &&
        !user.disabled &&
        (await tx.user.count({ where: { role: "ADMIN", disabled: false } })) <=
          1
      )
        throw new HttpError(400, "ไม่สามารถลบผู้ดูแลที่ใช้งานได้คนสุดท้าย");

      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), disabled: true },
      });
      await tx.userSession.deleteMany({ where: { userId: id } });
    });
    return NextResponse.json({ success: true, data: { id, signedOut: false } });
  });
}
