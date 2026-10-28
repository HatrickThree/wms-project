import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const { workspace } = await workspaceAccessForRequest(request);
    const workspaceId = workspace.id;
    const page = Math.max(
      1,
      Math.min(
        100_000,
        Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1),
      ),
    );
    const where = { workspaceId };
    const [events, count] = await Promise.all([
      prisma.operationalEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 50,
        take: 50,
      }),
      prisma.operationalEvent.count({ where }),
    ]);
    const parsed = events.map((e) => {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(e.detailsJson);
      } catch {}
      return { ...e, details };
    });
    const orderIds = parsed.flatMap((e) =>
      typeof e.details.orderId === "string" ? [e.details.orderId] : [],
    );
    const countIds = parsed.flatMap((e) =>
      typeof e.details.countId === "string" ? [e.details.countId] : [],
    );
    const [orders, counts] = await Promise.all([
      prisma.stockOrder.findMany({
        where: { workspaceId, id: { in: orderIds } },
        select: { id: true, number: true },
      }),
      prisma.countRun.findMany({
        where: { workspaceId, id: { in: countIds } },
        select: { id: true, number: true },
      }),
    ]);
    const actions: Record<string, string> = {
      reserve: "จองสินค้า",
      pick: "ตรวจหยิบ",
      ship: "ยืนยันจ่าย",
      cancel: "ยกเลิกคำสั่งซื้อ",
    };
    const types: Record<string, string> = {
      receive: "รับสินค้าเข้า",
      transfer: "จัดเก็บ / ย้ายตำแหน่ง",
      "create-order": "สร้างคำสั่งซื้อ",
      "abc-settings": "เปลี่ยนการตั้งค่า ABC / รอบวัน",
      "abc-analyze": "วิเคราะห์ ABC เป็นข้อเสนอ",
      "abc-confirm": "ยืนยันกลุ่ม ABC",
      "count-start": "เริ่มตรวจนับ",
      "count-entry": "บันทึกผลนับ",
      "count-submit": "ส่งผลนับ",
      "count-approve": "ตรวจอนุมัติผลนับ",
      "count-cancel": "ยกเลิกงานนับ",
      "map.save": "บันทึกผังคลังจำลอง",
      "map.route": "สร้างแผนเส้นทางหยิบ",
      "training.save": "บันทึกร่างโจทย์",
      "training.approve": "ผู้สอนตรวจเกณฑ์สมรรถนะ",
      "training.publish": "เปิดรอบฝึกแยกคลัง",
      "training.start": "เริ่มรอบฝึก",
      "training.submit": "ส่งงานรอบฝึก",
      "training.review": "ประเมินสมรรถนะรายบุคคล",
      "research.save": "บันทึกร่างเครื่องมือวิจัย",
      "research.approve": "อนุมัติเครื่องมือวิจัย",
      "workspace.delete": "ลบพื้นที่ออกจากการใช้งาน",
      "workspace.restore": "กู้คืนพื้นที่",
    };
    return NextResponse.json({
      success: true,
      data: {
        events: parsed.map((e) => ({
          id: e.id,
          type: e.type,
          label:
            e.type === "order-action"
              ? actions[String(e.details.action)] || "คำสั่งซื้อ"
              : types[e.type] || "บันทึกงานคลัง",
          actor: e.actor,
          createdAt: e.createdAt,
          reference:
            typeof e.details.referenceDoc === "string"
              ? e.details.referenceDoc
              : typeof e.details.number === "string"
                ? e.details.number
                : orders.find((o) => o.id === e.details.orderId)?.number ||
                  counts.find((c) => c.id === e.details.countId)?.number ||
                  "",
          reason:
            typeof e.details.reason === "string" ? e.details.reason : null,
        })),
        count,
        page,
        pageSize: 50,
      },
    });
  });
}
