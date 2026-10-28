import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { SessionProfile } from "@/lib/session-types";
import { deletedWorkspaces } from "@/lib/workspace-state";

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE = "stockspace_session";
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored?: string) {
  const [algorithm, salt, encoded] = (
    stored || `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`
  ).split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(encoded || "")
  )
    return false;
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(encoded, "hex")) && !!stored;
}

export function digestSession(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const readSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: digestSession(token) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          disabled: true,
        },
      },
      activeWorkspace: true,
    },
  });
  if (!session || session.expiresAt <= new Date() || session.user.disabled)
    return null;
  return session;
});

export async function workspaceVisibility(user: {
  id: string;
  role: UserRole;
}): Promise<Prisma.WorkspaceWhereInput> {
  const excluded = {
    id: { notIn: (await deletedWorkspaces()).map((row) => row.workspaceId) },
  };
  if (user.role === "ADMIN") return excluded;
  return {
    ...excluded,
    type: user.role === "STAFF" ? "BUSINESS" : "TRAINING",
    OR: [
      { members: { some: { userId: user.id } } },
      ...(user.role === "INSTRUCTOR" ? [{ ownerId: user.id }] : []),
    ],
  };
}

export async function requireSession() {
  const session = await readSession();
  if (!session) throw new HttpError(401, "กรุณาเข้าสู่ระบบก่อนใช้งาน");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN")
    throw new HttpError(403, "ส่วนนี้สำหรับผู้ดูแลระบบ");
  return session;
}

export async function requireWorkspaceAccess() {
  const session = await requireSession();
  if (!session.activeWorkspaceId)
    throw new HttpError(409, "กรุณาเลือกพื้นที่ธุรกิจหรือรอบฝึกก่อนใช้งาน");
  const workspace = await prisma.workspace.findFirst({
    where: {
      AND: [
        { id: session.activeWorkspaceId },
        await workspaceVisibility(session.user),
      ],
    },
  });
  if (!workspace)
    throw new HttpError(
      403,
      "ไม่มีสิทธิ์เข้าถึงพื้นที่นี้ กรุณาเลือกพื้นที่ที่ได้รับมอบหมาย",
    );
  const trainingRound =
    session.user.role === "STUDENT"
      ? await prisma.trainingRound.findUnique({
          where: { workspaceId: workspace.id },
          select: { id: true, status: true, configJson: true },
        })
      : null;
  return {
    user: session.user,
    workspace,
    sessionId: session.id,
    trainingRound,
  };
}
export type WorkspaceAccess = Awaited<
  ReturnType<typeof requireWorkspaceAccess>
>;

export async function workspaceAccessForRequest(request: Request) {
  const access = await requireWorkspaceAccess();
  const expected = request.headers.get("x-workspace-id");
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (mutation) requireSameOrigin(request);
  if ((mutation || expected) && expected !== access.workspace.id)
    throw new HttpError(
      409,
      "พื้นที่ทำงานเปลี่ยนไปแล้ว กรุณารีเฟรชและตรวจพื้นที่ก่อนทำรายการ",
    );
  if (access.user.role === "STUDENT") {
    const path = new URL(request.url).pathname;
    const operational = [
      "/api/stock",
      "/api/inventory",
      "/api/serials",
      "/api/abc",
      "/api/activity",
      "/api/orders",
      "/api/maps",
      "/api/labels",
      "/api/counts",
      "/api/receipts",
      "/api/inbound",
      "/api/outbound",
      "/api/transfers",
    ].some((p) => path === p || path.startsWith(p + "/"));
    if (operational && access.trainingRound?.status !== "ACTIVE")
      throw new HttpError(
        403,
        "ข้อมูลและงานคลังของผู้เรียนเปิดเฉพาะรอบฝึกที่เริ่มแล้ว ดูโจทย์หรือแบบวิจัยจากเมนูห้องเรียน",
      );
    const config = access.trainingRound
      ? (JSON.parse(access.trainingRound.configJson) as { task: string })
      : null;
    if (
      config?.task === "COUNT" &&
      [
        "/api/stock",
        "/api/inventory",
        "/api/serials",
        "/api/abc",
        "/api/activity",
        "/api/orders",
        "/api/maps",
        "/api/labels",
      ].some((p) => path === p || path.startsWith(p + "/"))
    )
      throw new HttpError(
        403,
        "รอบตรวจนับไม่เปิดยอดอ้างอิง ใช้ชั้นสินค้าจำลองและแบบบันทึกผลนับ",
      );
  }
  return access;
}

export async function requirePageSession() {
  if (!(await prisma.user.count())) redirect("/setup");
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}
export async function requirePageWorkspace() {
  await requirePageSession();
  try {
    return await requireWorkspaceAccess();
  } catch (error) {
    if (error instanceof HttpError && error.status !== 401)
      redirect("/workspaces");
    throw error;
  }
}

export async function profileForSession(): Promise<SessionProfile> {
  const session = await requirePageSession();
  const workspace = session.activeWorkspaceId
    ? await prisma.workspace.findFirst({
        where: {
          AND: [
            { id: session.activeWorkspaceId },
            await workspaceVisibility(session.user),
          ],
        },
        select: { id: true, name: true, code: true, type: true },
      })
    : null;
  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      role: session.user.role,
    },
    workspace,
  };
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // APP_ORIGIN is trusted server configuration, never a client-supplied Host value.
  const expectedOrigin = new URL(process.env.APP_ORIGIN || request.url).origin;
  if (origin && origin !== expectedOrigin)
    throw new HttpError(403, "ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
}

export async function openSession(
  userId: string,
  workspaceId: string | null,
  request: Request,
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const jar = await cookies();
  const previous = jar.get(SESSION_COOKIE)?.value;
  await prisma.$transaction(async (tx) => {
    if (previous && /^[a-f0-9]{64}$/.test(previous))
      await tx.userSession.deleteMany({
        where: { tokenHash: digestSession(previous) },
      });
    await tx.userSession.create({
      data: {
        tokenHash: digestSession(token),
        userId,
        activeWorkspaceId: workspaceId,
        expiresAt,
      },
    });
  });
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      new URL(process.env.APP_ORIGIN || request.url).protocol === "https:",
    path: "/",
    expires: expiresAt,
  });
}
