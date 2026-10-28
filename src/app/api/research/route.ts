import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { HttpError, workspaceAccessForRequest } from "@/lib/auth";
import {
  researchData,
  saveForm,
  approveForm,
  answerForm,
} from "@/services/research.service";
export async function GET(request: Request) {
  return apiHandler(async () =>
    NextResponse.json({
      success: true,
      data: await researchData(await workspaceAccessForRequest(request)),
    }),
  );
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const a = await workspaceAccessForRequest(request),
      body = await request.json();
    const data =
      body.action === "save"
        ? await saveForm(body, a)
        : body.action === "approve"
          ? await approveForm(body, a)
          : body.action === "answer"
            ? await answerForm(body, a)
            : null;
    if (!data) throw new HttpError(400, "ไม่พบคำสั่งแบบวิจัย");
    return NextResponse.json({ success: true, data });
  });
}
