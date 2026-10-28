import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { countData, startCount } from "@/services/counts.service";
export async function GET(request: Request) {
  return apiHandler(async () =>
    NextResponse.json({
      success: true,
      data: await countData(await workspaceAccessForRequest(request)),
    }),
  );
}
export async function POST(request: Request) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    return NextResponse.json(
      { success: true, data: await startCount(await request.json(), access) },
      { status: 201 },
    );
  });
}
