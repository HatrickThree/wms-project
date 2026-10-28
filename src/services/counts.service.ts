import { prisma } from "@/lib/db";
import type { SerialStatus } from "@prisma/client";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import {
  requireStockApproval,
  requireStockOperator,
} from "@/lib/warehouse-permissions";
import {
  StartCountSchema,
  CountActionSchema,
} from "@/lib/validations/count.schema";
import { stockOperation } from "./stock-operation";
import { convertToBase } from "./units";

interface Snapshot {
  product: {
    id: string;
    trackSerial: boolean;
    trackLot: boolean;
    baseUom: string;
    issuePolicy: string;
  };
  balances: {
    id: string;
    locationId: string;
    version: number;
    qtyOnHand: number;
    qtyAllocated: number;
  }[];
  layers: {
    id: string;
    locationId: string;
    lotId: string | null;
    lotNumber: string;
    expiresOn: string | null;
    receivedAt: string;
    qtyOnHand: number;
    qtyAllocated: number;
  }[];
  serials: {
    id: string;
    serialNumber: string;
    status: SerialStatus;
    locationId: string;
    stockLayerId: string | null;
    lotNumber: string | null;
  }[];
}
const canApprove = (a: WorkspaceAccess) =>
  a.workspace.type === "BUSINESS"
    ? a.user.role === "ADMIN"
    : ["ADMIN", "INSTRUCTOR"].includes(a.user.role);
const ownWhere = (access: WorkspaceAccess) => ({
  workspaceId: access.workspace.id,
  ...(canApprove(access) || access.trainingRound?.status === "ACTIVE" ? {} : { startedBy: access.user.username }),
});
const groupKey = (locationId: string, lotNumber: string) =>
  JSON.stringify([locationId, lotNumber]);
export async function countData(access: WorkspaceAccess, id?: string) {
  requireStockOperator(access);
  if (!id)
    return {
      runs: await prisma.countRun.findMany({
        where: ownWhere(access),
        select: {
          id: true,
          number: true,
          status: true,
          mode: true,
          startedAt: true,
          startedBy: true,
          approvedAt: true,
          product: { select: { sku: true, name: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 100,
      }),
      limit: 100,
    };
  const run = await prisma.countRun.findFirst({
    where: { id, ...ownWhere(access) },
    include: {
      product: { include: { units: { where: { active: true } } } },
      entries: true,
    },
  });
  if (!run) throw new HttpError(404, "ไม่พบงานตรวจนับในพื้นที่นี้");
  const snapshot = JSON.parse(run.snapshotJson) as Snapshot;
  const locations = await prisma.location.findMany({
    where: {
      workspaceId: access.workspace.id,
      id: { in: run.entries.map((e) => e.locationId) },
    },
    select: { id: true, barcode: true, type: true },
  });
  const showExpected =
    (canApprove(access) && run.status !== "OPEN") || run.status === "APPROVED";
  return {
    id: run.id,
    number: run.number,
    status: run.status,
    mode: run.mode,
    startedAt: run.startedAt,
    startedBy: run.startedBy,
    submittedAt: run.submittedAt,
    approvedAt: run.approvedAt,
    approvedBy: run.approvedBy,
    reason: run.reason,
    product: run.product,
    entries: run.entries.map((e) => {
      const expected = snapshot.layers
        .filter(
          (l) => l.locationId === e.locationId && l.lotNumber === e.lotNumber,
        )
        .reduce((sum, l) => sum + l.qtyOnHand, 0);
      return {
        id: e.id,
        locationId: e.locationId,
        locationBarcode:
          locations.find((l) => l.id === e.locationId)?.barcode || "—",
        lotNumber: e.lotNumber,
        expiresOn: e.expiresOn,
        actualQuantity: e.actualQuantity,
        enteredQuantity: e.enteredQuantity,
        enteredUom: e.enteredUom,
        conversionFactor: e.conversionFactor,
        serialNumbers: JSON.parse(e.serialsJson) as string[],
        countedBy: e.countedBy,
        countedAt: e.countedAt,
        ...(showExpected
          ? {
              expectedQuantity: expected,
              variance:
                e.actualQuantity === null ? null : e.actualQuantity - expected,
              ...(run.product.trackSerial
                ? {
                    expectedSerialNumbers: snapshot.serials
                      .filter(
                        (s) =>
                          s.locationId === e.locationId &&
                          (s.lotNumber || "") === e.lotNumber,
                      )
                      .map((s) => s.serialNumber),
                    missingSerialNumbers: snapshot.serials
                      .filter(
                        (s) =>
                          s.locationId === e.locationId &&
                          (s.lotNumber || "") === e.lotNumber &&
                          !(JSON.parse(e.serialsJson) as string[]).includes(
                            s.serialNumber,
                          ),
                      )
                      .map((s) => s.serialNumber),
                    addedSerialNumbers: (
                      JSON.parse(e.serialsJson) as string[]
                    ).filter(
                      (sn) =>
                        !snapshot.serials.some(
                          (s) =>
                            s.serialNumber === sn &&
                            s.locationId === e.locationId &&
                            (s.lotNumber || "") === e.lotNumber,
                        ),
                    ),
                  }
                : {}),
            }
          : {}),
      };
    }),
    canApprove: canApprove(access),
  };
}
export async function startCount(input: unknown, access: WorkspaceAccess) {
  requireStockOperator(access);
  const data = StartCountSchema.parse(input);
  return stockOperation(
    access,
    data.operationId,
    { type: "count-start", ...data },
    async (tx) => {
      const workspaceId = access.workspace.id;
      const product = await tx.product.findFirst({
        where: { id: data.productId, workspaceId },
      });
      if (!product) throw new HttpError(404, "ไม่พบสินค้าในพื้นที่นี้");
      if (
        await tx.countRun.count({
          where: {
            workspaceId,
            productId: product.id,
            status: { in: ["OPEN", "SUBMITTED"] },
          },
        })
      )
        throw new HttpError(409, "สินค้านี้มีงานตรวจนับที่ยังไม่ปิด");
      const balances = await tx.inventoryBalance.findMany({
        where: { workspaceId, productId: product.id },
        orderBy: { id: "asc" },
        select: {
          id: true,
          locationId: true,
          version: true,
          qtyOnHand: true,
          qtyAllocated: true,
        },
      });
      const layers = await tx.stockLayer.findMany({
        where: { workspaceId, productId: product.id },
        include: { lot: true },
        orderBy: { id: "asc" },
      });
      const serials = await tx.serialItem.findMany({
        where: {
          workspaceId,
          productId: product.id,
          locationId: { not: null },
          status: { not: "SHIPPED" },
        },
        select: {
          id: true,
          serialNumber: true,
          status: true,
          locationId: true,
          stockLayerId: true,
          lotNumber: true,
        },
      });
      if (
        balances.some((b) => b.qtyAllocated > 0) ||
        layers.some((l) => l.qtyAllocated > 0) ||
        serials.some((s) => ["ALLOCATED", "PICKED"].includes(s.status))
      )
        throw new HttpError(
          409,
          "ต้องจ่ายหรือคืนยอดจอง/รายการหยิบของ SKU นี้ให้เสร็จก่อนเริ่มตรวจนับ",
        );
      const snapshot: Snapshot = {
        product: {
          id: product.id,
          trackSerial: product.trackSerial,
          trackLot: product.trackLot,
          baseUom: product.baseUom,
          issuePolicy: product.issuePolicy,
        },
        balances,
        layers: layers.map((l) => ({
          id: l.id,
          locationId: l.locationId,
          lotId: l.lotId,
          lotNumber: l.lot?.number || "",
          expiresOn: l.lot?.expiresOn || null,
          receivedAt: l.receivedAt.toISOString(),
          qtyOnHand: l.qtyOnHand,
          qtyAllocated: l.qtyAllocated,
        })),
        serials: serials.map((s) => ({ ...s, locationId: s.locationId! })),
      };
      const grouped = new Map<
        string,
        { locationId: string; lotNumber: string; expiresOn: string | null }
      >();
      snapshot.layers
        .filter((l) => l.qtyOnHand > 0)
        .forEach((l) =>
          grouped.set(groupKey(l.locationId, l.lotNumber), {
            locationId: l.locationId,
            lotNumber: l.lotNumber,
            expiresOn: l.expiresOn,
          }),
        );
      return tx.countRun.create({
        data: {
          workspaceId,
          productId: product.id,
          number: data.number,
          mode: data.mode,
          snapshotJson: JSON.stringify(snapshot),
          startedBy: access.user.username,
          entries: { create: [...grouped.values()] },
        },
        select: { id: true, number: true, status: true },
      });
    },
  );
}
export async function actOnCount(
  id: string,
  input: unknown,
  access: WorkspaceAccess,
) {
  requireStockOperator(access);
  const data = CountActionSchema.parse(input);
  if (data.action === "approve") requireStockApproval(access);
  return stockOperation(
    access,
    data.operationId,
    { type: `count-${data.action}`, countId: id, ...data },
    async (tx) => {
      const workspaceId = access.workspace.id;
      const run = await tx.countRun.findFirst({
        where: { id, ...ownWhere(access) },
        include: { product: true, entries: true },
      });
      if (!run) throw new HttpError(404, "ไม่พบงานตรวจนับ");
      const snapshot = JSON.parse(run.snapshotJson) as Snapshot;
      if (data.action === "entry") {
        if (run.status !== "OPEN")
          throw new HttpError(409, "แก้ผลนับได้เฉพาะงานที่ยังไม่ส่งตรวจ");
        const location = await tx.location.findUnique({
          where: {
            workspaceId_barcode: { workspaceId, barcode: data.locationBarcode },
          },
        });
        if (!location) throw new HttpError(400, "ไม่พบตำแหน่งในพื้นที่นี้");
        const unit = await convertToBase(
          tx,
          run.product,
          data.quantity,
          data.unitId,
        );
        const quantity = unit.baseQuantity;
        if (
          run.product.trackSerial &&
          (quantity !== data.serialNumbers.length ||
            new Set(data.serialNumbers).size !== quantity)
        )
          throw new HttpError(
            400,
            "จำนวน Serial ต้องตรงกับยอดหน่วยหลักที่นับและไม่ซ้ำกัน",
          );
        if (!run.product.trackSerial && data.serialNumbers.length)
          throw new HttpError(400, "สินค้านี้ใช้จำนวน ไม่ควบคุม Serial");
        if (
          quantity > 0 &&
          (run.product.trackLot || run.product.issuePolicy === "FEFO") &&
          !data.lotNumber
        )
          throw new HttpError(400, "ต้องระบุ Lot ของสินค้าที่พบ");
        if (
          quantity > 0 &&
          run.product.issuePolicy === "FEFO" &&
          !data.expiresOn
        )
          throw new HttpError(400, "สินค้า FEFO ต้องมีวันหมดอายุตามฉลาก");
        const previous = run.entries.find(
          (e) => e.locationId === location.id && e.lotNumber === data.lotNumber,
        );
        const duplicate = run.entries
          .filter((e) => e.id !== previous?.id)
          .some((e) =>
            (JSON.parse(e.serialsJson) as string[]).some((sn) =>
              data.serialNumbers.includes(sn),
            ),
          );
        if (duplicate)
          throw new HttpError(
            400,
            "มี Serial นี้ในผลนับตำแหน่งอื่นแล้ว กรุณาตรวจป้าย",
          );
        const lot = data.lotNumber
          ? await tx.stockLot.findUnique({
              where: {
                productId_number: {
                  productId: run.productId,
                  number: data.lotNumber,
                },
              },
            })
          : null;
        if (lot && (lot.expiresOn || undefined) !== data.expiresOn)
          throw new HttpError(
            400,
            "วันหมดอายุไม่ตรงกับ Lot เดิม ต้องตรวจสอบก่อนส่งผลนับ",
          );
        await tx.countEntry.upsert({
          where: {
            runId_locationId_lotNumber: {
              runId: id,
              locationId: location.id,
              lotNumber: data.lotNumber,
            },
          },
          create: {
            runId: id,
            locationId: location.id,
            lotNumber: data.lotNumber,
            expiresOn: data.expiresOn,
            actualQuantity: quantity,
            enteredQuantity: data.quantity,
            enteredUom: unit.name,
            conversionFactor: unit.factor,
            serialsJson: JSON.stringify(data.serialNumbers),
            countedBy: access.user.username,
            countedAt: new Date(),
          },
          update: {
            expiresOn: data.expiresOn,
            actualQuantity: quantity,
            enteredQuantity: data.quantity,
            enteredUom: unit.name,
            conversionFactor: unit.factor,
            serialsJson: JSON.stringify(data.serialNumbers),
            countedBy: access.user.username,
            countedAt: new Date(),
          },
        });
      } else if (data.action === "submit") {
        if (run.status !== "OPEN")
          throw new HttpError(409, "งานนี้ส่งผลแล้วหรือปิดไปแล้ว");
        if (run.entries.some((e) => e.actualQuantity === null))
          throw new HttpError(
            400,
            "ต้องบันทึกผลทุกตำแหน่ง/Lot ที่อยู่ในแผน แม้ไม่พบสินค้าให้ระบุ 0",
          );
        await tx.countRun.update({
          where: { id },
          data: { status: "SUBMITTED", submittedAt: new Date() },
        });
      } else if (data.action === "cancel") {
        if (!["OPEN", "SUBMITTED"].includes(run.status))
          throw new HttpError(409, "งานตรวจนับนี้ปิดแล้ว");
        await tx.countRun.update({
          where: { id },
          data: { status: "CANCELLED", reason: data.reason },
        });
      } else {
        if (run.status !== "SUBMITTED")
          throw new HttpError(
            409,
            "อนุมัติได้หลังผู้ตรวจนับส่งผลครบแล้วเท่านั้น",
          );
        const balances = await tx.inventoryBalance.findMany({
          where: { workspaceId, productId: run.productId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            locationId: true,
            version: true,
            qtyOnHand: true,
            qtyAllocated: true,
          },
        });
        const metadata = {
          id: run.product.id,
          trackSerial: run.product.trackSerial,
          trackLot: run.product.trackLot,
          baseUom: run.product.baseUom,
          issuePolicy: run.product.issuePolicy,
        };
        if (
          JSON.stringify(balances) !== JSON.stringify(snapshot.balances) ||
          JSON.stringify(metadata) !== JSON.stringify(snapshot.product)
        ) {
          await tx.countRun.update({
            where: { id },
            data: {
              status: "STALE",
              reason:
                "ยอด การจอง หรือวิธีควบคุมสินค้าเปลี่ยนหลังเริ่มนับ ต้องนับรอบใหม่",
            },
          });
          return {
            id,
            status: "STALE",
            message:
              "ข้อมูลเปลี่ยนหลังเริ่มนับ ไม่มีการปรับยอด กรุณาเริ่มนับรอบใหม่",
          };
        }
        const entries = run.entries;
        const serialNumbers = entries.flatMap(
          (e) => JSON.parse(e.serialsJson) as string[],
        );
        if (new Set(serialNumbers).size !== serialNumbers.length)
          throw new HttpError(400, "มี Serial ซ้ำข้ามตำแหน่ง");
        const existing = run.product.trackSerial
          ? await tx.serialItem.findMany({
              where: { workspaceId, serialNumber: { in: serialNumbers } },
            })
          : [];
        for (const serial of existing) {
          const original = snapshot.serials.find((s) => s.id === serial.id);
          const entry = entries.find((e) =>
            (JSON.parse(e.serialsJson) as string[]).includes(
              serial.serialNumber,
            ),
          )!;
          if (
            !original ||
            original.locationId !== entry.locationId ||
            (original.lotNumber || "") !== entry.lotNumber
          )
            throw new HttpError(
              400,
              `${serial.serialNumber}: มีประวัติหรืออยู่คนละตำแหน่ง/Lot ต้องตรวจรับคืนหรือทำรายการย้ายให้ถูกต้อง แล้วเริ่มนับใหม่`,
            );
        }
        for (const entry of entries) {
          const observed = JSON.parse(entry.serialsJson) as string[];
          const oldLayers = snapshot.layers.filter(
            (l) =>
              l.locationId === entry.locationId &&
              l.lotNumber === entry.lotNumber,
          );
          const expected = oldLayers.reduce((sum, l) => sum + l.qtyOnHand, 0);
          const delta = entry.actualQuantity! - expected;
          let lotId: string | null = oldLayers[0]?.lotId || null;
          if (entry.lotNumber) {
            const lot = await tx.stockLot.findUnique({
              where: {
                productId_number: {
                  productId: run.productId,
                  number: entry.lotNumber,
                },
              },
            });
            if (lot && (lot.expiresOn || null) !== entry.expiresOn)
              throw new HttpError(409, "ข้อมูล Lot เปลี่ยนไป ต้องตรวจสอบใหม่");
            lotId =
              lot?.id ||
              (
                await tx.stockLot.create({
                  data: {
                    workspaceId,
                    productId: run.productId,
                    number: entry.lotNumber,
                    expiresOn: entry.expiresOn,
                  },
                })
              ).id;
          }
          const oldSerials = snapshot.serials.filter(
            (s) =>
              s.locationId === entry.locationId &&
              (s.lotNumber || "") === entry.lotNumber,
          );
          const missing = run.product.trackSerial
            ? oldSerials.filter((s) => !observed.includes(s.serialNumber))
            : [];
          const added = run.product.trackSerial
            ? observed.filter(
                (sn) => !existing.some((s) => s.serialNumber === sn),
              )
            : [];
          if (run.product.trackSerial) {
            for (const serial of missing) {
              if (!serial.stockLayerId)
                throw new HttpError(
                  409,
                  "Serial เดิมไม่ผูกกับรอบรับเข้า ต้องตรวจข้อมูลก่อน",
                );
              if (
                (
                  await tx.stockLayer.updateMany({
                    where: {
                      id: serial.stockLayerId,
                      qtyOnHand: { gte: 1 },
                      qtyAllocated: 0,
                    },
                    data: { qtyOnHand: { decrement: 1 } },
                  })
                ).count !== 1
              )
                throw new HttpError(409, "ยอดรอบรับเข้าเปลี่ยนไป");
              if (
                (
                  await tx.serialItem.updateMany({
                    where: {
                      id: serial.id,
                      status: serial.status,
                      locationId: entry.locationId,
                    },
                    data: { status: "MISSING", locationId: null },
                  })
                ).count !== 1
              )
                throw new HttpError(409, "สถานะ Serial เปลี่ยนไป");
              await tx.stockLedger.create({
                data: {
                  workspaceId,
                  productId: run.productId,
                  serialItemId: serial.id,
                  fromLocationId: entry.locationId,
                  qtyChange: -1,
                  movementType: "ADJUSTMENT_MINUS",
                  referenceDoc: run.number,
                  performedBy: access.user.username,
                  note: `ตรวจนับไม่พบ · สถานะเดิม ${serial.status} · ${data.reason}`,
                },
              });
            }
            if (added.length) {
              const layer = await tx.stockLayer.create({
                data: {
                  workspaceId,
                  productId: run.productId,
                  locationId: entry.locationId,
                  lotId,
                  qtyOnHand: added.length,
                  referenceDoc: run.number,
                },
              });
              for (const serialNumber of added) {
                const serial = await tx.serialItem.create({
                  data: {
                    workspaceId,
                    productId: run.productId,
                    locationId: entry.locationId,
                    stockLayerId: layer.id,
                    lotNumber: entry.lotNumber || null,
                    serialNumber,
                    inboundDocNo: run.number,
                  },
                });
                await tx.stockLedger.create({
                  data: {
                    workspaceId,
                    productId: run.productId,
                    serialItemId: serial.id,
                    toLocationId: entry.locationId,
                    qtyChange: 1,
                    movementType: "ADJUSTMENT_PLUS",
                    referenceDoc: run.number,
                    performedBy: access.user.username,
                    note: `ตรวจนับพบเพิ่ม · ${data.reason}`,
                  },
                });
              }
            }
          } else if (delta !== 0) {
            if (delta > 0)
              await tx.stockLayer.create({
                data: {
                  workspaceId,
                  productId: run.productId,
                  locationId: entry.locationId,
                  lotId,
                  qtyOnHand: delta,
                  referenceDoc: run.number,
                },
              });
            else {
              let remove = -delta;
              for (const layer of [...oldLayers].sort(
                (a, b) =>
                  b.receivedAt.localeCompare(a.receivedAt) ||
                  b.id.localeCompare(a.id),
              )) {
                if (!remove) break;
                const amount = Math.min(layer.qtyOnHand, remove);
                if (!amount) continue;
                if (
                  (
                    await tx.stockLayer.updateMany({
                      where: {
                        id: layer.id,
                        qtyOnHand: layer.qtyOnHand,
                        qtyAllocated: 0,
                      },
                      data: { qtyOnHand: { decrement: amount } },
                    })
                  ).count !== 1
                )
                  throw new HttpError(409, "ยอดรอบรับเข้าเปลี่ยนไป");
                remove -= amount;
              }
              if (remove)
                throw new HttpError(409, "ยอดชั้นรับเข้าไม่พอสำหรับปรับลด");
            }
            await tx.stockLedger.create({
              data: {
                workspaceId,
                productId: run.productId,
                fromLocationId: delta < 0 ? entry.locationId : null,
                toLocationId: delta > 0 ? entry.locationId : null,
                qtyChange: delta,
                movementType:
                  delta > 0 ? "ADJUSTMENT_PLUS" : "ADJUSTMENT_MINUS",
                referenceDoc: run.number,
                performedBy: access.user.username,
                note: `Lot ${entry.lotNumber || "-"} · ตรวจนับปรับผลต่าง · ${data.reason}`,
              },
            });
          }
          if (
            delta === 0 &&
            run.product.trackSerial &&
            (missing.length || added.length)
          )
            await tx.inventoryBalance.update({
              where: {
                productId_locationId: {
                  productId: run.productId,
                  locationId: entry.locationId,
                },
              },
              data: { qtyOnHand: { increment: 0 } },
            });
          if (delta !== 0) {
            const balance = await tx.inventoryBalance.findUnique({
              where: {
                productId_locationId: {
                  productId: run.productId,
                  locationId: entry.locationId,
                },
              },
            });
            if (balance) {
              if (balance.qtyAllocated || balance.qtyOnHand + delta < 0)
                throw new HttpError(409, "ยอดรวมเปลี่ยนไป");
              await tx.inventoryBalance.update({
                where: { id: balance.id },
                data: { qtyOnHand: { increment: delta } },
              });
            } else if (delta > 0)
              await tx.inventoryBalance.create({
                data: {
                  workspaceId,
                  productId: run.productId,
                  locationId: entry.locationId,
                  qtyOnHand: delta,
                },
              });
            else throw new HttpError(409, "ไม่พบยอดอ้างอิงตำแหน่งนี้");
          }
        }
        for (const balance of await tx.inventoryBalance.findMany({
          where: { workspaceId, productId: run.productId },
        })) {
          const sum = await tx.stockLayer.aggregate({
            where: {
              workspaceId,
              productId: run.productId,
              locationId: balance.locationId,
            },
            _sum: { qtyOnHand: true, qtyAllocated: true },
          });
          if (
            (sum._sum.qtyOnHand || 0) !== balance.qtyOnHand ||
            (sum._sum.qtyAllocated || 0) !== balance.qtyAllocated
          )
            throw new HttpError(
              409,
              "ยอดรวมกับรอบรับเข้าไม่ตรงกัน ยังไม่อนุมัติผลนับ",
            );
          if (
            run.product.trackSerial &&
            (await tx.serialItem.count({
              where: {
                workspaceId,
                productId: run.productId,
                locationId: balance.locationId,
                status: { notIn: ["SHIPPED", "MISSING"] },
              },
            })) !== balance.qtyOnHand
          )
            throw new HttpError(
              409,
              "จำนวน Serial กับยอดรวมไม่ตรงกัน ยังไม่อนุมัติผลนับ",
            );
        }
        const now = new Date();
        await tx.countRun.update({
          where: { id },
          data: {
            status: "APPROVED",
            approvedAt: now,
            approvedBy: access.user.username,
            reason: data.reason,
          },
        });
        await tx.aBCProfile.upsert({
          where: { productId: run.productId },
          create: { workspaceId, productId: run.productId, lastCountedAt: now },
          update: { lastCountedAt: now },
        });
      }
      return tx.countRun.findUniqueOrThrow({
        where: { id },
        select: { id: true, number: true, status: true },
      });
    },
  );
}
