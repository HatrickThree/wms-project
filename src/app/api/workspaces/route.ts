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
import { deletedWorkspaces } from "@/lib/workspace-state";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const session = await requireSession();
    const deleted = new URL(request.url).searchParams.get("deleted") === "1";
    if (deleted && session.user.role !== "ADMIN")
      throw new HttpError(
        403,
        "เฉพาะผู้ดูแลระบบที่ดูหรือกู้คืนพื้นที่ที่ลบได้",
      );
    const removed = await deletedWorkspaces();
    const workspaces = await prisma.workspace.findMany({
      where: deleted
        ? { id: { in: removed.map((row) => row.workspaceId) } }
        : await workspaceVisibility(session.user),
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
        workspaces: workspaces.map((w) => ({
          ...w,
          deletion: removed.find((row) => row.workspaceId === w.id) || null,
        })),
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
