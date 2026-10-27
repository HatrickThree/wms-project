import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import bwipjs from "bwip-js/node";
import { prisma } from "@/lib/db";
import { LabelFormatSchema, LabelKindSchema } from "@/lib/labels";

export const runtime = "nodejs";
const QuerySchema = z.object({
  kind: LabelKindSchema,
  id: z.string().min(1).max(100),
  format: LabelFormatSchema.default("qr"),
  download: z.enum(["0", "1"]).default("0"),
});

export async function GET(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success)
      return NextResponse.json(
        { success: false, error: "ข้อมูลป้ายไม่ถูกต้อง" },
        { status: 400 },
      );
    const { kind, id, format, download } = parsed.data;
    try {
      const record =
        kind === "location"
          ? await prisma.location.findFirst({
              where: { id, workspaceId: access.workspace.id },
              select: { barcode: true },
            })
          : kind === "product"
            ? await prisma.product.findFirst({
                where: { id, workspaceId: access.workspace.id },
                select: { sku: true },
              })
            : await prisma.serialItem.findFirst({
                where: { id, workspaceId: access.workspace.id },
                select: { serialNumber: true },
              });
      if (!record)
        return NextResponse.json(
          { success: false, error: "ไม่พบข้อมูลสำหรับป้ายนี้" },
          { status: 404 },
        );
      const code =
        "sku" in record
          ? record.sku
          : "barcode" in record
            ? record.barcode
            : record.serialNumber;
      if (
        code.length > 256 ||
        (format === "code128" && !/^[\x20-\x7E]+$/.test(code))
      )
        return NextResponse.json(
          {
            success: false,
            error:
              "รหัสนี้ไม่รองรับบาร์โค้ด Code 128 หรือยาวเกินไป กรุณาเลือก QR Code หรือปรับรหัส",
          },
          { status: 422 },
        );
      const png = await bwipjs.toBuffer({
        bcid: format === "qr" ? "qrcode" : "code128",
        text: code,
        scale: 3,
        padding: 12,
        backgroundcolor: "FFFFFF",
        ...(format === "code128" ? { height: 12 } : {}),
      });
      return new Response(new Uint8Array(png), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
          "Content-Disposition": `${download === "1" ? "attachment" : "inline"}; filename="wms-${kind}-${format}.png"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "สร้างภาพรหัสไม่สำเร็จ กรุณาตรวจข้อมูลหรือลองใช้ QR Code",
        },
        { status: 500 },
      );
    }
  });
}
