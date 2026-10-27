import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  HttpError,
  requireSameOrigin,
  requireSession,
  workspaceVisibility,
} from "@/lib/auth";
import { CreateWorkspaceSchema } from "@/lib/validations/auth.schema";

export async function GET() {
  return apiHandler(async () => {
    const session = await requireSession();
    const workspaces = await prisma.workspace.findMany({
      where: workspaceVisibility(session.user),
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        ownerId: true,
        _count: { select: { members: true, products: true } },
      },
    });
    return NextResponse.json({
      success: true,
      data: {
        workspaces,
        activeWorkspaceId: session.activeWorkspaceId,
        role: session.user.role,
        userId: session.user.id,
      },
    });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const session = await requireSession();
    const input = CreateWorkspaceSchema.parse(await request.json());
    if (
      session.user.role !== "ADMIN" &&
      !(session.user.role === "INSTRUCTOR" && input.type === "TRAINING")
    )
      throw new HttpError(
        403,
        "สร้างพื้นที่ได้เฉพาะผู้ดูแล หรือผู้สอนที่สร้างพื้นที่ฝึก",
      );
    const code = `${input.type === "BUSINESS" ? "BIZ" : "TRAIN"}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const workspace = await prisma.workspace.create({
      data: {
        ...input,
        code,
        ownerId: session.user.id,
        members: { create: { userId: session.user.id } },
      },
      select: { id: true },
    });
    return NextResponse.json(
      { success: true, data: workspace },
      { status: 201 },
    );
  });
}
