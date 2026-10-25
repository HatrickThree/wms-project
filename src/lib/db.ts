import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteWalInitialized: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

// เปิดโหมด WAL (Write-Ahead Logging) และตั้งค่า busy_timeout ให้ SQLite รองรับการยิงบาร์โค้ดพร้อมกันได้ดีขึ้น
if (!globalForPrisma.sqliteWalInitialized) {
  prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;").catch(() => {});
  prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;").catch(() => {});
  prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;").catch(() => {});
  globalForPrisma.sqliteWalInitialized = true;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
