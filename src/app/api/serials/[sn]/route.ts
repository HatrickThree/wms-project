import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sn: string }> }
) {
  try {
    const { sn } = await params;
    const item = await prisma.serialItem.findUnique({
      where: { serialNumber: sn },
      include: {
        product: true,
        location: true,
        movements: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: `ไม่พบหมายเลข Serial Number: ${sn}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการค้นหา S/N";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
