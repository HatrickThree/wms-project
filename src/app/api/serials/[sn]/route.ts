import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sn: string }> },
) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const { sn } = await params;
    const item = await prisma.serialItem.findUnique({
      where: {
        workspaceId_serialNumber: {
          workspaceId: access.workspace.id,
          serialNumber: sn,
        },
      },
      include: {
        product: true,
        location: true,
        movements: {
          where: { workspaceId: access.workspace.id },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!item) throw new HttpError(404, "ไม่พบ Serial นี้ในพื้นที่ปัจจุบัน");
    return NextResponse.json({ success: true, data: item });
  });
}
