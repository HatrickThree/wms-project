import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import { LessonConfigSchema, operationTasks } from "@/lib/training";
import { workspaceDeletion } from "@/lib/workspace-state";

export function businessToday(now = new Date()) {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

// Persist the command and result with stock changes, so lost responses can be retried safely.
export async function stockOperation<T>(
  access: WorkspaceAccess,
  key: string,
  payload: unknown,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeout?: number } = {},
): Promise<T> {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const existing = await prisma.stockOperation.findUnique({
    where: { workspaceId_key: { workspaceId: access.workspace.id, key } },
  });
  const read = (row: { payloadHash: string; resultJson: string }) => {
    if (row.payloadHash !== payloadHash)
      throw new HttpError(
        409,
        "รหัสรายการนี้ใช้กับข้อมูลอื่นแล้ว กรุณาสร้างรายการใหม่",
      );
    return JSON.parse(row.resultJson) as T;
  };
  if (existing) return read(existing);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const repeated = await tx.stockOperation.findUnique({
          where: { workspaceId_key: { workspaceId: access.workspace.id, key } },
        });
        if (repeated) return read(repeated);
        const details = payload as { type?: string };
        if (
          !["workspace.delete", "workspace.restore"].includes(
            details.type || "",
          ) &&
          (await workspaceDeletion(access.workspace.id, tx))
        )
          throw new HttpError(
            403,
            "พื้นที่นี้ถูกลบออกจากการใช้งานแล้ว กรุณาเลือกพื้นที่อื่น",
          );
        const round = await tx.trainingRound.findUnique({
          where: { workspaceId: access.workspace.id },
        });
        if (access.user.role === "STUDENT") {
          if (!round)
            throw new HttpError(
              403,
              "ผู้เรียนต้องทำงานผ่านรอบฝึกที่ได้รับมอบหมาย",
            );
          const type = details.type || "";
          const configuration = LessonConfigSchema.parse(
            JSON.parse(round.configJson),
          );
          const lifecycle =
            (type === "training.start" && round.status === "READY") ||
            (type === "training.submit" && round.status === "ACTIVE");
          if (
            !lifecycle &&
            (round.status !== "ACTIVE" ||
              !operationTasks[configuration.task].includes(type))
          )
            throw new HttpError(
              403,
              "งานนี้ไม่ได้เปิดให้ทำในรอบฝึกปัจจุบัน หรือส่งงานไปแล้ว",
            );
        }
        const result = await action(tx);
        if (round)
          await tx.trainingEvent.create({
            data: {
              roundId: round.id,
              operationKey: key,
              actor: access.user.username,
              actorRole: access.user.role,
              type: details.type || "stock",
              success: true,
              createdAt: new Date(),
              detailsJson: JSON.stringify(payload),
            },
          });
        await tx.operationalEvent.create({
          data: {
            workspaceId: access.workspace.id,
            operationKey: key,
            type: details.type || "stock",
            actor: access.user.username,
            detailsJson: JSON.stringify(payload),
          },
        });
        await tx.stockOperation.create({
          data: {
            workspaceId: access.workspace.id,
            key,
            payloadHash,
            resultJson: JSON.stringify(result),
          },
        });
        return result;
      },
      { maxWait: 10_000, timeout: options.timeout || 20_000 },
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status >= 400 &&
      error.status < 500 &&
      access.user.role === "STUDENT"
    ) {
      const round = await prisma.trainingRound.findUnique({
        where: { workspaceId: access.workspace.id },
      });
      const details = payload as { type?: string };
      if (
        round?.status === "ACTIVE" &&
        operationTasks[
          LessonConfigSchema.parse(JSON.parse(round.configJson)).task
        ].includes(details.type || "")
      ) {
        // Rejections are recorded after rollback. They cannot commit any stock effects.
        await prisma.trainingEvent.upsert({
          where: {
            roundId_operationKey: {
              roundId: round.id,
              operationKey: `rejected:${key}:${payloadHash}`,
            },
          },
          update: {},
          create: {
            roundId: round.id,
            operationKey: `rejected:${key}:${payloadHash}`,
            actor: access.user.username,
            actorRole: access.user.role,
            type: details.type || "stock",
            success: false,
            createdAt: new Date(),
            detailsJson: JSON.stringify({
              ...(payload as object),
              rejection: error.message,
              payloadHash,
            }),
          },
        });
      }
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034", "P1008"].includes(error.code)
    ) {
      const completed = await prisma.stockOperation.findUnique({
        where: { workspaceId_key: { workspaceId: access.workspace.id, key } },
      });
      if (completed) return read(completed);
      if (error.code !== "P2002")
        throw new HttpError(
          409,
          "มีรายการอื่นกำลังใช้สต็อกนี้ กรุณาตรวจข้อมูลล่าสุดแล้วลองรายการเดิมอีกครั้ง",
        );
    }
    throw error;
  }
}
