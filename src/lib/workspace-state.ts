import type { Prisma } from "wms-prisma-client";
import { prisma } from "@/lib/db";
type Reader = Pick<Prisma.TransactionClient, "workspaceDeletion">;

export async function deletedWorkspaces(db: Reader = prisma) {
  return db.workspaceDeletion.findMany();
}
export async function workspaceDeletion(id: string, db: Reader = prisma) {
  return db.workspaceDeletion.findUnique({ where: { workspaceId: id } });
}
