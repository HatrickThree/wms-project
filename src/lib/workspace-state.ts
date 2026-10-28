import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
type Reader = Pick<Prisma.TransactionClient, "$queryRaw">;
interface DeletedRow {
  workspaceId: string;
  deletedAt: Date | string | number;
  deletedBy: string;
}
const normalize = (row: DeletedRow) => ({
  ...row,
  deletedAt: new Date(
    row.deletedAt instanceof Date ? row.deletedAt.getTime() : row.deletedAt,
  ),
});
// Additive lifecycle table: parameterized SQL works with an already-running client,
// without replacing the loaded Windows engine library or restarting the web server.
export async function deletedWorkspaces(db: Reader = prisma) {
  return (
    await db.$queryRaw<
      DeletedRow[]
    >`SELECT "workspaceId","deletedAt","deletedBy" FROM "WorkspaceDeletion"`
  ).map(normalize);
}
export async function workspaceDeletion(id: string, db: Reader = prisma) {
  const rows = await db.$queryRaw<
    DeletedRow[]
  >`SELECT "workspaceId","deletedAt","deletedBy" FROM "WorkspaceDeletion" WHERE "workspaceId"=${id}`;
  return rows[0] ? normalize(rows[0]) : null;
}
