import { PrismaClient, Prisma } from "wms-prisma-client";

const globalForPrisma = globalThis as unknown as {
  postgresPrisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.postgresPrisma ?? new PrismaClient({
  log: ["warn", "error"],
  // PostgreSQL defaults to ReadCommitted; preserve warehouse invariants under
  // competing reservations, counts, membership changes, and first-admin setup.
  transactionOptions: {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 20_000,
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.postgresPrisma = prisma;
