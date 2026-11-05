import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { changeWorkspaceState } from "@/services/workspace-lifecycle.service";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(request: Request, { params }: Context) {
  return apiHandler(async () => {
    return NextResponse.json({
      success: true,
      data: await changeWorkspaceState(
        (await params).id,
        await request.json(),
        "delete",
      ),
    });
  });
}
export async function POST(request: Request, { params }: Context) {
  return apiHandler(async () => {
    return NextResponse.json({
      success: true,
      data: await changeWorkspaceState(
        (await params).id,
        await request.json(),
        "restore",
      ),
    });
  });
}
