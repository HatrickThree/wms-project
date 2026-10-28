import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
import {
  trainingData,
  saveLesson,
  approveLesson,
  publishLesson,
  roundAction,
  shelfData,
  reviewRound,
} from "@/services/training.service";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const a = await workspaceAccessForRequest(request),
      barcode = new URL(request.url).searchParams.get("locationBarcode");
    return NextResponse.json({
      success: true,
      data: barcode ? await shelfData(a, barcode) : await trainingData(a),
    });
  });
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const a = await workspaceAccessForRequest(request),
      body = await request.json();
    const data =
      body.action === "save"
        ? await saveLesson(body, a)
        : body.action === "approve"
          ? await approveLesson(body, a)
          : body.action === "publish"
            ? await publishLesson(body, a)
            : ["start", "submit"].includes(body.action)
              ? await roundAction(body, a)
              : body.action === "review"
                ? await reviewRound(body, a)
                : null;
    if (!data) throw new HttpError(400, "ไม่พบคำสั่งรอบฝึก");
    return NextResponse.json({ success: true, data });
  });
}
