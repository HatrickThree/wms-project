import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "@/lib/auth";

export async function apiHandler(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          success: false,
          error: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง",
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { success: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" },
        { status: 400 },
      );
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      ["P2034", "P1008", "P2028"].includes(String(error.code))
    )
      return NextResponse.json(
        {
          success: false,
          error:
            "มีรายการอื่นกำลังใช้งานข้อมูลนี้ กรุณาตรวจข้อมูลล่าสุดแล้วลองรายการเดิมอีกครั้ง",
        },
        { status: 409 },
      );
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    )
      return NextResponse.json(
        {
          success: false,
          error: "รหัสหรือรายการนี้มีอยู่แล้ว กรุณาตรวจสอบข้อมูล",
        },
        { status: 409 },
      );
    return NextResponse.json(
      {
        success: false,
        error: "ยังทำรายการไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล",
      },
      { status: 500 },
    );
  }
}
