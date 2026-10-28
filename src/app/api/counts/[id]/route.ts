import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { workspaceAccessForRequest } from "@/lib/auth";
import { countData, actOnCount } from "@/services/counts.service";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () =>
    NextResponse.json({
      success: true,
      data: await countData(
        await workspaceAccessForRequest(request),
        (await params).id,
      ),
    }),
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return apiHandler(async () => {
    const access = await workspaceAccessForRequest(request);
    return NextResponse.json({
      success: true,
      data: await actOnCount((await params).id, await request.json(), access),
    });
  });
}
