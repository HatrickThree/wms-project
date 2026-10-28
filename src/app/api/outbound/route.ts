import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    void access;
    return NextResponse.json(
      {
        success: false,
        error:
          "ระบบใช้คำสั่งซื้อ → จอง → หยิบ → ยืนยันจ่ายแล้ว กรุณาเปิดหน้าจ่ายสินค้าออกเพื่อสร้างคำสั่งซื้อ",
      },
      { status: 410 },
    );
  });
}
