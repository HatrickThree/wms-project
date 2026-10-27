import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  hashPassword,
  HttpError,
  openSession,
  requireSameOrigin,
} from "@/lib/auth";
import { SetupSchema } from "@/lib/validations/auth.schema";

export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const input = SetupSchema.parse(await request.json());
    if (await prisma.user.count())
      throw new HttpError(409, "ตั้งค่าผู้ดูแลคนแรกแล้ว กรุณาเข้าสู่ระบบ");
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      if (await tx.user.count())
        throw new HttpError(409, "ตั้งค่าผู้ดูแลคนแรกแล้ว กรุณาเข้าสู่ระบบ");
      const created = await tx.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          role: "ADMIN",
        },
      });
      await tx.workspace.upsert({
        where: { id: "business-main" },
        create: {
          id: "business-main",
          code: "BUSINESS-MAIN",
          name: "พื้นที่ธุรกิจหลัก",
          type: "BUSINESS",
          ownerId: created.id,
          members: { create: { userId: created.id } },
        },
        update: {
          ownerId: created.id,
          members: { create: { userId: created.id } },
        },
      });
      return created;
    });
    await openSession(user.id, "business-main", request);
    return NextResponse.json({ success: true, data: { next: "/" } });
  });
}
