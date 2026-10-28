import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import { requireStockApproval } from "@/lib/warehouse-permissions";
import { calculateABC, type ABCResult } from "@/lib/abc";
import {
  ABCSettingsSchema,
  ABCAnalyzeSchema,
  ABCConfirmSchema,
  ABCTieRuleSchema,
} from "@/lib/validations/abc.schema";
import { businessToday, stockOperation } from "./stock-operation";

interface Snapshot extends ABCResult {
  name: string;
  previousClass: string | null;
  previousConfirmedAt: string | null;
}
export const abcDefaults = {
  windowDays: 90,
  thresholdA: 80,
  thresholdB: 95,
  tieRule: "SKU_ORDER" as string | null,
  daysA: null as number | null,
  daysB: null as number | null,
  daysC: null as number | null,
};
export async function abcData(
  access: WorkspaceAccess,
  params: URLSearchParams,
) {
  const workspaceId = access.workspace.id;
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  const q = params.get("q")?.trim().slice(0, 100) || "";
  const [settings, runs, history] = await Promise.all([
    prisma.aBCSettings.findUnique({ where: { workspaceId } }),
    prisma.aBCRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        fromDate: true,
        toDate: true,
        createdAt: true,
        createdBy: true,
        thresholdA: true,
        thresholdB: true,
        tieRule: true,
      },
    }),
    prisma.aBCAssignment.findMany({
      where: { workspaceId },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: { confirmedAt: "desc" },
      take: 20,
    }),
  ]);
  const config = settings || abcDefaults;
  const runId = params.get("runId") || runs[0]?.id;
  const run = runId
    ? await prisma.aBCRun.findFirst({ where: { id: runId, workspaceId } })
    : null;
  if (runId && !run) throw new HttpError(404, "ไม่พบผลวิเคราะห์ในพื้นที่นี้");
  const all = run ? (JSON.parse(run.resultsJson) as Snapshot[]) : [];
  const filtered = q
    ? all.filter((x) =>
        `${x.sku} ${x.name}`.toLowerCase().includes(q.toLowerCase()),
      )
    : all;
  const slice = filtered.slice((page - 1) * 100, page * 100);
  const profiles = await prisma.aBCProfile.findMany({
    where: { workspaceId, productId: { in: slice.map((x) => x.productId) } },
  });
  return {
    settings: config,
    runs,
    run: run
      ? {
          id: run.id,
          fromDate: run.fromDate,
          toDate: run.toDate,
          thresholdA: run.thresholdA,
          thresholdB: run.thresholdB,
          tieRule: run.tieRule,
          createdAt: run.createdAt,
        }
      : null,
    items: slice.map((item) => {
      const profile =
        profiles.find((p) => p.productId === item.productId) || null;
      const days =
        profile?.class === "A"
          ? config.daysA
          : profile?.class === "B"
            ? config.daysB
            : profile?.class === "C"
              ? config.daysC
              : null;
      return {
        ...item,
        profile,
        cycleDays: days,
        dueDate:
          profile?.lastCountedAt && days
            ? businessToday(
                new Date(profile.lastCountedAt.getTime() + days * 86400000),
              )
            : null,
      };
    }),
    total: filtered.length,
    totalProducts: all.length,
    page,
    pageSize: 100,
    history,
    today: businessToday(),
  };
}
export async function saveABCSettings(input: unknown, access: WorkspaceAccess) {
  requireStockApproval(access);
  const data = ABCSettingsSchema.parse(input);
  const { operationId, ...settings } = data;
  return stockOperation(
    access,
    operationId,
    { type: "abc-settings", ...data },
    (tx) =>
      tx.aBCSettings.upsert({
        where: { workspaceId: access.workspace.id },
        create: {
          workspaceId: access.workspace.id,
          ...settings,
          updatedBy: access.user.username,
        },
        update: { ...settings, updatedBy: access.user.username },
      }),
  );
}
export async function analyzeABC(input: unknown, access: WorkspaceAccess) {
  requireStockApproval(access);
  const data = ABCAnalyzeSchema.parse(input);
  if (data.toDate > businessToday())
    throw new HttpError(400, "เลือกช่วงข้อมูลถึงวันที่ปัจจุบันได้เท่านั้น");
  const from = new Date(`${data.fromDate}T00:00:00+07:00`).getTime();
  const until = new Date(`${data.toDate}T00:00:00+07:00`).getTime() + 86400000;
  if (until - from > 3650 * 86400000)
    throw new HttpError(400, "ช่วงวิเคราะห์ต้องไม่เกิน 3,650 วัน");
  return stockOperation(
    access,
    data.operationId,
    { type: "abc-analyze", ...data },
    async (tx) => {
      const workspaceId = access.workspace.id;
      const settings = await tx.aBCSettings.findUnique({
        where: { workspaceId },
      });
      if (!settings?.tieRule)
        throw new HttpError(
          400,
          "ผู้มีสิทธิ์ต้องยืนยันการตั้งค่าและวิธีจัดการความถี่เท่ากันก่อนวิเคราะห์",
        );
      const tieRule = ABCTieRuleSchema.parse(settings.tieRule);
      const products = await tx.product.findMany({
        where: { workspaceId },
        include: { abcProfile: true },
      });
      const frequencies = await tx.$queryRaw<
        { productId: string; frequency: bigint }[]
      >(
        Prisma.sql`SELECT productId,COUNT(DISTINCT referenceDoc) AS frequency FROM StockLedger WHERE workspaceId=${workspaceId} AND movementType IN ('OUTBOUND_PICK','OUTBOUND_SHIP') AND qtyChange<0 AND (CASE WHEN typeof(createdAt) IN ('integer','real') THEN createdAt ELSE unixepoch(createdAt)*1000 END)>=${from} AND (CASE WHEN typeof(createdAt) IN ('integer','real') THEN createdAt ELSE unixepoch(createdAt)*1000 END)<${until} GROUP BY productId`,
      );
      const byId = new Map(
        frequencies.map((x) => [x.productId, Number(x.frequency)]),
      );
      const proposed = calculateABC(
        products.map((p) => ({
          productId: p.id,
          sku: p.sku,
          frequency: byId.get(p.id) || 0,
        })),
        settings.thresholdA,
        settings.thresholdB,
        tieRule,
      );
      const productsById = new Map(products.map((p) => [p.id, p]));
      const results = proposed.map((x) => {
        const p = productsById.get(x.productId)!;
        return {
          ...x,
          name: p.name,
          previousClass: p.abcProfile?.class || null,
          previousConfirmedAt: p.abcProfile?.confirmedAt?.toISOString() || null,
        };
      });
      return tx.aBCRun.create({
        data: {
          workspaceId,
          fromDate: data.fromDate,
          toDate: data.toDate,
          thresholdA: settings.thresholdA,
          thresholdB: settings.thresholdB,
          tieRule,
          resultsJson: JSON.stringify(results),
          createdBy: access.user.username,
        },
        select: { id: true, fromDate: true, toDate: true },
      });
    },
  );
}
export async function confirmABC(input: unknown, access: WorkspaceAccess) {
  requireStockApproval(access);
  const data = ABCConfirmSchema.parse(input);
  if (
    new Set(data.changes.map((x) => x.productId)).size !== data.changes.length
  )
    throw new HttpError(400, "มีสินค้าให้ยืนยันซ้ำกัน");
  return stockOperation(
    access,
    data.operationId,
    { type: "abc-confirm", ...data },
    async (tx) => {
      const workspaceId = access.workspace.id;
      const run = await tx.aBCRun.findFirst({
        where: { id: data.runId, workspaceId },
      });
      if (!run) throw new HttpError(404, "ไม่พบผลวิเคราะห์ในพื้นที่นี้");
      const items = JSON.parse(run.resultsJson) as Snapshot[];
      const now = new Date();
      for (const change of data.changes) {
        const item = items.find((x) => x.productId === change.productId);
        if (!item) throw new HttpError(400, "สินค้าไม่อยู่ในผลวิเคราะห์นี้");
        const product = await tx.product.findFirst({
          where: { id: item.productId, workspaceId },
          select: { sku: true, name: true },
        });
        if (!product || product.sku !== item.sku || product.name !== item.name)
          throw new HttpError(
            409,
            "ข้อมูลสินค้าเปลี่ยนหลังวิเคราะห์ กรุณาวิเคราะห์ใหม่ก่อนยืนยันกลุ่ม",
          );
        const current = await tx.aBCProfile.findUnique({
          where: { productId: item.productId },
        });
        if (
          (current?.class || null) !== item.previousClass ||
          (current?.confirmedAt?.toISOString() || null) !==
            item.previousConfirmedAt
        )
          throw new HttpError(
            409,
            `${item.sku}: มีการยืนยันกลุ่มหลังวิเคราะห์แล้ว กรุณาวิเคราะห์ใหม่ก่อนเปลี่ยนกลุ่ม`,
          );
        if (
          change.class !== item.recommendedClass &&
          (!change.reason || change.reason.length < 5)
        )
          throw new HttpError(
            400,
            "การเลือกต่างจากข้อเสนอต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร",
          );
        await tx.aBCProfile.upsert({
          where: { productId: item.productId },
          create: {
            workspaceId,
            productId: item.productId,
            class: change.class,
            confirmedAt: now,
            confirmedBy: access.user.username,
          },
          update: {
            class: change.class,
            confirmedAt: now,
            confirmedBy: access.user.username,
          },
        });
        await tx.aBCAssignment.create({
          data: {
            workspaceId,
            productId: item.productId,
            runId: run.id,
            oldClass: current?.class,
            newClass: change.class,
            reason: change.reason,
            confirmedBy: access.user.username,
          },
        });
      }
      return { confirmedCount: data.changes.length, runId: run.id };
    },
  );
}
