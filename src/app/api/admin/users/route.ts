import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import { hashPassword, requireAdmin, requireSameOrigin } from "@/lib/auth";
import { CreateUserSchema } from "@/lib/validations/auth.schema";
const publicUser = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  disabled: true,
  createdAt: true,
} as const;
export async function GET() {
  return apiHandler(async () => {
    await requireAdmin();
    const users = await prisma.user.findMany({
      select: publicUser,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: users });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
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
