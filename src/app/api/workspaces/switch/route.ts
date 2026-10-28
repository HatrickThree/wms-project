import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import {
  HttpError,
  requireSameOrigin,
  requireSession,
  workspaceVisibility,
} from "@/lib/auth";
export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const session = await requireSession();
    const input = z
      .object({ workspaceId: z.string().min(1).max(100) })
      .parse(await request.json());
    const workspace = await prisma.workspace.findFirst({
      where: {
        AND: [
          { id: input.workspaceId },
          await workspaceVisibility(session.user),
        ],
      },
    });
    if (!workspace) throw new HttpError(403, "ไม่มีสิทธิ์เข้าถึงพื้นที่นี้");
    await prisma.userSession.update({
      where: { id: session.id },
      data: { activeWorkspaceId: workspace.id },
    });
    return NextResponse.json({ success: true, data: { next: "/" } });
  });
}
