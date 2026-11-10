import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { CreateUserSchema } from "@/lib/validations/auth.schema";
const publicUser = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  disabled: true,
  deletedAt: true,
  createdAt: true,
} as const;
export async function GET(request: Request) {
  return apiHandler(async () => {
    await requireAdmin();
    const deleted = new URL(request.url).searchParams.get("deleted") === "1";
    const users = await prisma.user.findMany({
      where: { deletedAt: deleted ? { not: null } : null },
      select: publicUser,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: users });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    await requireAdmin();
    const input = CreateUserSchema.parse(await request.json());
    const user = await prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        role: input.role,
        passwordHash: await hashPassword(input.password),
      },
      select: publicUser,
    });
    return NextResponse.json({ success: true, data: user }, { status: 201 });
  });
}
