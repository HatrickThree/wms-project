import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api";
import { digestSession, requireSameOrigin, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  return apiHandler(async () => {
    requireSameOrigin(request);
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token && /^[a-f0-9]{64}$/.test(token))
      await prisma.userSession.deleteMany({
        where: { tokenHash: digestSession(token) },
      });
    jar.delete(SESSION_COOKIE);
    return NextResponse.json({ success: true, data: { next: "/login" } });
  });
}
