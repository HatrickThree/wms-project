import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import { HttpError, requireSameOrigin, requireSession } from "@/lib/auth";

async function manageableWorkspace(id: string) {
  const session = await requireSession();
  const workspace = await prisma.workspace.findFirst({
    where: {
      id,
      ...(session.user.role === "ADMIN"
        ? {}
        : { ownerId: session.user.id, type: "TRAINING" }),
    },
  });
  if (!workspace || !["ADMIN", "INSTRUCTOR"].includes(session.user.role))
    throw new HttpError(403, "ไม่มีสิทธิ์จัดการสมาชิกพื้นที่นี้");
  return { workspace, user: session.user };
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const { workspace, user } = await manageableWorkspace((await params).id);
    const [members, candidates] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        select: {
          user: {
            select: { id: true, username: true, displayName: true, role: true },
          },
        },
      }),
      user.role === "ADMIN"
        ? prisma.user.findMany({
            where: {
              disabled: false,
              role: {
                in:
                  workspace.type === "BUSINESS"
                    ? ["ADMIN", "STAFF"]
                    : ["ADMIN", "INSTRUCTOR", "STUDENT"],
              },
            },
            select: { id: true, username: true, displayName: true, role: true },
            orderBy: { username: "asc" },
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      success: true,
      data: { members: members.map((member) => member.user), candidates },
    });
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const { workspace, user } = await manageableWorkspace((await params).id);
    const input = z
      .object({
        userId: z.string().min(1).max(100).optional(),
        username: z
          .string()
          .trim()
          .min(3)
          .max(40)
          .transform((value) => value.toLowerCase())
          .optional(),
      })
      .refine(
        (value) => !!value.userId !== !!value.username,
        "ระบุบัญชีที่ต้องการเพิ่มหนึ่งรายการ",
      )
      .parse(await request.json());
    const target = await prisma.user.findUnique({
      where: input.userId
        ? { id: input.userId }
        : { username: input.username! },
    });
    const allowed =
      workspace.type === "BUSINESS"
        ? ["ADMIN", "STAFF"]
        : ["ADMIN", "INSTRUCTOR", "STUDENT"];
    if (
      !target ||
      target.disabled ||
      !allowed.includes(target.role) ||
      (user.role === "INSTRUCTOR" && target.role !== "STUDENT")
    )
      throw new HttpError(400, "บทบาทของบัญชีนี้ไม่ตรงกับประเภทพื้นที่");
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: target.id },
      },
      create: { workspaceId: workspace.id, userId: target.id },
      update: {},
    });
    return NextResponse.json({ success: true, data: { added: true } });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const { workspace } = await manageableWorkspace((await params).id);
    const { userId } = z
      .object({ userId: z.string().min(1).max(100) })
      .parse(await request.json());
    if (userId === workspace.ownerId)
      throw new HttpError(400, "ไม่สามารถนำเจ้าของพื้นที่ออกได้");
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: workspace.id, userId },
    });
    return NextResponse.json({ success: true, data: { removed: true } });
  });
}
