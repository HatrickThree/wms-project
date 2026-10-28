import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import {
  LessonConfigSchema,
  type LessonConfig,
  type PhysicalShelf,
  simulateShelves,
  seededRandom,
} from "@/lib/training";
import { MapGraphSchema } from "@/lib/warehouse-map";
import { OperationKeySchema } from "@/lib/validations/stock.schema";
import { stockOperation } from "./stock-operation";
import { csvText } from "@/lib/research";
import { deletedWorkspaces } from "@/lib/workspace-state";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function requireInstructor(a: WorkspaceAccess) {
  if (
    a.workspace.type !== "TRAINING" ||
    !["ADMIN", "INSTRUCTOR"].includes(a.user.role)
  )
    throw new HttpError(403, "ส่วนนี้สำหรับผู้สอนหรือผู้ดูแลในพื้นที่ฝึก");
}
const config = (text: string) => LessonConfigSchema.parse(JSON.parse(text));
interface Assessment {
  userId: string;
  username: string;
  displayName: string;
  decision: string;
  note: string;
  criteria: { id: string; result: string; evidence: string }[];
  reviewedBy: string;
  reviewedAt: string;
}
export async function trainingData(access: WorkspaceAccess) {
  const removed = (await deletedWorkspaces()).map((row) => row.workspaceId);
  const where = { workspaceId: access.workspace.id };
  const teacher =
    ["ADMIN", "INSTRUCTOR"].includes(access.user.role) &&
    access.workspace.type === "TRAINING";
  const [lessons, round, roster] = await Promise.all([
    teacher
      ? prisma.trainingLesson.findMany({
          where,
          include: {
            rounds: {
              where: { workspaceId: { notIn: removed } },
              select: {
                id: true,
                workspaceId: true,
                name: true,
                status: true,
                seed: true,
                fixtureHash: true,
                startedAt: true,
                submittedAt: true,
                reviewedAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
    prisma.trainingRound.findUnique({
      where: { workspaceId: access.workspace.id },
      include: {
        lesson: { select: { title: true, approvedBy: true, approvedAt: true } },
        events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
    teacher
      ? prisma.workspaceMember.findMany({
          where: {
            workspaceId: access.workspace.id,
            user: { role: "STUDENT", disabled: false },
          },
          select: {
            user: { select: { id: true, username: true, displayName: true } },
          },
        })
      : [],
  ]);
  const participantIds: string[] = round
    ? JSON.parse(round.configJson).participants || []
    : [];
  const participants = round
    ? await prisma.user.findMany({
        where: { id: { in: participantIds } },
        select: { id: true, username: true, displayName: true },
      })
    : [];
  const assessments: Assessment[] = round?.assessmentJson
    ? JSON.parse(round.assessmentJson)
    : [];
  const plans = round
    ? await prisma.pickingPlan.findMany({
        where: {
          workspaceId: round.workspaceId,
          ...(round.submittedAt
            ? { createdAt: { lte: round.submittedAt } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latestPlans = new Map<string, (typeof plans)[number]>();
  for (const p of plans) {
    const key = `${p.orderId}:${p.warehouseId}`;
    if (!latestPlans.has(key)) latestPlans.set(key, p);
  }
  return {
    teacher,
    isTraining: access.workspace.type === "TRAINING",
    roster: roster.map((r) => r.user),
    lessons: lessons.map((l) => ({
      ...l,
      config: JSON.parse(l.configJson),
      configHash: hash(JSON.parse(l.configJson)),
      configJson: undefined,
    })),
    round: round
      ? {
          id: round.id,
          name: round.name,
          status: round.status,
          seed: round.seed,
          fixtureHash: round.fixtureHash,
          lesson: round.lesson,
          config: {
            ...config(round.configJson),
            groups: teacher
              ? config(round.configJson).groups
              : config(round.configJson).groups.filter((g) =>
                  g.userIds.some((id) => participantIds.includes(id)),
                ),
          },
          startedAt: round.startedAt,
          submittedAt: round.submittedAt,
          reviewedAt: round.reviewedAt,
          reviewedBy: round.reviewedBy,
          participants: teacher
            ? participants
            : participants.filter((p) => p.id === access.user.id),
          assessments: teacher
            ? assessments
            : assessments.filter((r) => r.userId === access.user.id),
          metrics: {
            ...roundMetrics(round),
            plannedDistanceMeters: latestPlans.size
              ? [...latestPlans.values()].reduce(
                  (sum, p) => sum + JSON.parse(p.resultJson).distanceMeters,
                  0,
                )
              : null,
          },
          events: round.events
            .filter(
              (e) =>
                teacher ||
                e.type !== "training.review" ||
                JSON.parse(e.detailsJson).userId === access.user.id,
            )
            .slice(-200)
            .map((e) => ({
              id: e.id,
              actor: e.actor,
              actorRole: e.actorRole,
              type: e.type,
              success: e.success,
              createdAt: e.createdAt,
              details: JSON.parse(e.detailsJson),
            })),
          ...(teacher ? { truth: JSON.parse(round.truthJson) } : {}),
        }
      : null,
  };
}
function roundMetrics(round: {
  startedAt: Date | null;
  submittedAt: Date | null;
  events: {
    actorRole: string;
    success: boolean;
    type: string;
    detailsJson: string;
    createdAt: Date;
  }[];
}) {
  const events = round.events.filter(
    (e) =>
      e.actorRole === "STUDENT" &&
      (!round.submittedAt || e.createdAt <= round.submittedAt),
  );
  const picks = events.filter(
    (e) =>
      e.type === "order-action" && JSON.parse(e.detailsJson).action === "pick",
  );
  const correct = picks.filter((e) => e.success).length;
  return {
    elapsedSeconds:
      round.startedAt && round.submittedAt
        ? Math.max(
            0,
            Math.floor(
              (round.submittedAt.getTime() - round.startedAt.getTime()) / 1000,
            ),
          )
        : null,
    validatedPickCommands: picks.length,
    correctPickCommands: correct,
    pickCommandAccuracy: picks.length
      ? Math.round((correct / picks.length) * 10000) / 100
      : null,
    successfulCommands: events.filter(
      (e) => e.success && !e.type.startsWith("training."),
    ).length,
    rejectedCommands: events.filter((e) => !e.success).length,
    // Route plans are separate evidence, never presented as measured walking.
    distanceMeters: null,
  };
}
export async function saveLesson(raw: unknown, a: WorkspaceAccess) {
  requireInstructor(a);
  const input = z
    .object({
      operationId: OperationKeySchema,
      id: z.string().optional(),
      title: z
        .string()
        .trim()
        .min(3, "กรอกชื่อโจทย์อย่างน้อย 3 ตัวอักษร")
        .max(200),
      config: LessonConfigSchema,
    })
    .parse(raw);
  return stockOperation(
    a,
    input.operationId,
    { type: "training.save", ...input },
    async (tx) => {
      if (
        await tx.trainingRound.findUnique({
          where: { workspaceId: a.workspace.id },
        })
      )
        throw new HttpError(
          400,
          "สร้างแม่แบบโจทย์ในพื้นที่ฝึกหลัก แยกจากคลังรอบฝึก",
        );
      const students = input.config.groups.flatMap((g) => g.userIds);
      const valid = await tx.workspaceMember.count({
        where: {
          workspaceId: a.workspace.id,
          userId: { in: students },
          user: { role: "STUDENT", disabled: false },
        },
      });
      if (valid !== students.length)
        throw new HttpError(
          400,
          "เลือกเฉพาะผู้เรียนที่เป็นสมาชิกและเปิดใช้งานในพื้นที่ฝึกนี้",
        );
      const fields = {
        title: input.title,
        configJson: JSON.stringify(input.config),
        approvedAt: null,
        approvedBy: null,
      };
      if (input.id) {
        const l = await tx.trainingLesson.findFirst({
          where: { id: input.id, workspaceId: a.workspace.id, status: "DRAFT" },
        });
        if (!l) throw new HttpError(409, "แก้ไขได้เฉพาะร่างในพื้นที่นี้");
        await tx.trainingLesson.update({ where: { id: l.id }, data: fields });
        return {
          id: l.id,
          message: "บันทึกร่างแล้ว ต้องตรวจและอนุมัติการจับคู่เกณฑ์ใหม่",
        };
      }
      const l = await tx.trainingLesson.create({
        data: {
          ...fields,
          workspaceId: a.workspace.id,
          createdBy: a.user.username,
        },
      });
      return {
        id: l.id,
        message: "สร้างร่างโจทย์แล้ว ผู้สอนต้องตรวจเกณฑ์ก่อนเปิดใช้",
      };
    },
  );
}
export async function approveLesson(raw: unknown, a: WorkspaceAccess) {
  requireInstructor(a);
  const i = z
    .object({
      operationId: OperationKeySchema,
      lessonId: z.string().min(1),
      acknowledge: z.literal(true),
      expectedConfigHash: z.string().length(64),
    })
    .parse(raw);
  return stockOperation(
    a,
    i.operationId,
    { type: "training.approve", ...i },
    async (tx) => {
      const l = await tx.trainingLesson.findFirst({
        where: { id: i.lessonId, workspaceId: a.workspace.id, status: "DRAFT" },
      });
      if (!l) throw new HttpError(404, "ไม่พบร่างโจทย์");
      if (hash(JSON.parse(l.configJson)) !== i.expectedConfigHash)
        throw new HttpError(
          409,
          "ร่างเกณฑ์เปลี่ยนไปแล้ว โหลดและตรวจใหม่ก่อนอนุมัติ",
        );
      await tx.trainingLesson.update({
        where: { id: l.id },
        data: { approvedBy: a.user.username, approvedAt: new Date() },
      });
      return {
        message:
          "ผู้สอนยืนยันการจับคู่หน่วยสมรรถนะและหลักฐานแล้ว เปิดรอบฝึกได้",
      };
    },
  );
}
export async function publishLesson(raw: unknown, a: WorkspaceAccess) {
  requireInstructor(a);
  const i = z
    .object({ operationId: OperationKeySchema, lessonId: z.string().min(1) })
    .parse(raw);
  return stockOperation(
    a,
    i.operationId,
    { type: "training.publish", ...i },
    async (tx) => {
      const l = await tx.trainingLesson.findFirst({
        where: { id: i.lessonId, workspaceId: a.workspace.id, status: "DRAFT" },
      });
      if (!l || !l.approvedAt)
        throw new HttpError(
          409,
          "ต้องให้ผู้สอนตรวจและอนุมัติเกณฑ์ก่อนเปิดโจทย์",
        );
      const c = config(l.configJson);
      const [warehouses, locations, products, lots, layers, serials, maps] =
        await Promise.all([
          tx.warehouse.findMany({
            where: { workspaceId: a.workspace.id },
            orderBy: { code: "asc" },
          }),
          tx.location.findMany({
            where: { workspaceId: a.workspace.id },
            orderBy: { barcode: "asc" },
          }),
          tx.product.findMany({
            where: { workspaceId: a.workspace.id },
            include: { units: true },
            orderBy: { sku: "asc" },
          }),
          tx.stockLot.findMany({
            where: { workspaceId: a.workspace.id },
            orderBy: [{ productId: "asc" }, { number: "asc" }],
          }),
          tx.stockLayer.findMany({
            where: { workspaceId: a.workspace.id, qtyOnHand: { gt: 0 } },
            orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
          }),
          tx.serialItem.findMany({
            where: { workspaceId: a.workspace.id, locationId: { not: null } },
            orderBy: { serialNumber: "asc" },
          }),
          tx.warehouseMap.findMany({ where: { workspaceId: a.workspace.id } }),
        ]);
      if (!warehouses.length || !locations.length || !products.length)
        throw new HttpError(
          400,
          "เตรียมคลัง ตำแหน่ง และสินค้าในพื้นที่ฝึกแม่แบบก่อน",
        );
      if (
        products.length > 100 ||
        layers.length > 1000 ||
        serials.length > 2000 ||
        c.groups.length > 20
      )
        throw new HttpError(
          400,
          "รอบฝึกระยะแรกจำกัด 100 SKU, 1,000 ชั้นสต็อก, 2,000 Serial และ 20 กลุ่มต่อโจทย์ กรุณาแยกแม่แบบ",
        );
      if (
        layers.some((x) => x.qtyAllocated > 0) ||
        serials.some((s) => ["ALLOCATED", "PICKED"].includes(s.status))
      )
        throw new HttpError(409, "ปิดงานจองและหยิบค้างในแม่แบบก่อนสร้างรอบฝึก");
      if (serials.some((s) => s.status !== "IN_STOCK" || !s.stockLayerId))
        throw new HttpError(
          409,
          "แม่แบบต้องมีเฉพาะ Serial พร้อมใช้งานและผูกยอดถูกต้อง กรุณาตรวจสินค้าเสีย/คืนก่อน",
        );
      for (const p of products.filter((p) => p.trackSerial))
        for (const layer of layers.filter((x) => x.productId === p.id))
          if (
            serials.filter((s) => s.stockLayerId === layer.id).length !==
            layer.qtyOnHand
          )
            throw new HttpError(409, "Serial และยอดในแม่แบบไม่ตรงกัน");
      const balances = await tx.inventoryBalance.findMany({
        where: { workspaceId: a.workspace.id },
      });
      if (
        balances.some(
          (b) =>
            b.qtyAllocated > 0 ||
            b.qtyOnHand !==
              layers
                .filter(
                  (layer) =>
                    layer.productId === b.productId &&
                    layer.locationId === b.locationId,
                )
                .reduce((sum, layer) => sum + layer.qtyOnHand, 0),
        ) ||
        layers.some(
          (layer) =>
            !balances.some(
              (b) =>
                b.productId === layer.productId &&
                b.locationId === layer.locationId,
            ),
        )
      )
        throw new HttpError(
          409,
          "ยอดรวมและรอบรับเข้าในแม่แบบไม่ตรงกัน กรุณาตรวจสอบก่อนเปิดรอบ",
        );
      if (
        await tx.countRun.count({
          where: {
            workspaceId: a.workspace.id,
            status: { in: ["OPEN", "SUBMITTED"] },
          },
        })
      )
        throw new HttpError(409, "ปิดงานตรวจนับค้างในแม่แบบก่อนเปิดรอบฝึก");
      if (
        serials.some(
          (s) =>
            !products.find((p) => p.id === s.productId)?.trackSerial ||
            !layers.some((layer) => layer.id === s.stockLayerId),
        )
      )
        throw new HttpError(
          409,
          "Serial ในแม่แบบผูกสินค้า/รอบรับเข้าไม่ถูกต้อง",
        );
      const teachingMembers = await tx.workspaceMember.findMany({
        where: {
          workspaceId: a.workspace.id,
          user: { role: { in: ["ADMIN", "INSTRUCTOR"] }, disabled: false },
        },
        select: { userId: true },
      });
      const fixtureHash = hash({
        warehouses,
        locations,
        products,
        lots,
        layers,
        serials,
        maps,
      });
      const rounds = [];
      for (let index = 0; index < c.groups.length; index++) {
        const group = c.groups[index];
        const valid = await tx.workspaceMember.count({
          where: {
            workspaceId: a.workspace.id,
            userId: { in: group.userIds },
            user: { role: "STUDENT", disabled: false },
          },
        });
        if (valid !== group.userIds.length)
          throw new HttpError(
            409,
            "สมาชิกผู้เรียนเปลี่ยนไปแล้ว ตรวจรายชื่อก่อนเปิดรอบ",
          );
        const w = await tx.workspace.create({
          data: {
            code: `ROUND-${randomUUID()}`,
            name: `${l.title} · ${group.name}`,
            type: "TRAINING",
            ownerId: a.user.id,
            members: {
              create: [
                ...new Set([
                  a.user.id,
                  ...teachingMembers.map((m) => m.userId),
                  ...group.userIds,
                ]),
              ].map((userId) => ({ userId })),
            },
          },
        });
        const warehouseIds = new Map<string, string>(),
          locationIds = new Map<string, string>(),
          productIds = new Map<string, string>(),
          lotIds = new Map<string, string>(),
          layerIds = new Map<string, string>();
        for (const x of warehouses) {
          const row = await tx.warehouse.create({
            data: { workspaceId: w.id, code: x.code, name: x.name },
          });
          warehouseIds.set(x.id, row.id);
        }
        for (const x of locations) {
          const row = await tx.location.create({
            data: {
              workspaceId: w.id,
              warehouseId: warehouseIds.get(x.warehouseId)!,
              barcode: x.barcode,
              zone: x.zone,
              aisle: x.aisle,
              rack: x.rack,
              level: x.level,
              type: x.type,
            },
          });
          locationIds.set(x.id, row.id);
        }
        for (const x of products) {
          const row = await tx.product.create({
            data: {
              workspaceId: w.id,
              sku: x.sku,
              barcode: x.barcode,
              name: x.name,
              category: x.category,
              baseUom: x.baseUom,
              minStock: x.minStock,
              trackSerial: x.trackSerial,
              trackLot: x.trackLot,
              issuePolicy: x.issuePolicy,
            },
          });
          productIds.set(x.id, row.id);
          for (const u of x.units)
            await tx.productUnit.create({
              data: {
                workspaceId: w.id,
                productId: row.id,
                name: u.name,
                factor: u.factor,
                active: u.active,
              },
            });
        }
        for (const x of lots) {
          const row = await tx.stockLot.create({
            data: {
              workspaceId: w.id,
              productId: productIds.get(x.productId)!,
              number: x.number,
              expiresOn: x.expiresOn,
            },
          });
          lotIds.set(x.id, row.id);
        }
        for (const x of layers) {
          const row = await tx.stockLayer.create({
            data: {
              workspaceId: w.id,
              productId: productIds.get(x.productId)!,
              locationId: locationIds.get(x.locationId)!,
              lotId: x.lotId ? lotIds.get(x.lotId) : null,
              referenceDoc: "TRAINING-OPENING",
              receivedAt: x.receivedAt,
              qtyOnHand: x.qtyOnHand,
            },
          });
          layerIds.set(x.id, row.id);
          await tx.inventoryBalance.upsert({
            where: {
              productId_locationId: {
                productId: row.productId,
                locationId: row.locationId,
              },
            },
            create: {
              workspaceId: w.id,
              productId: row.productId,
              locationId: row.locationId,
              qtyOnHand: x.qtyOnHand,
            },
            update: { qtyOnHand: { increment: x.qtyOnHand } },
          });
          if (!products.find((p) => p.id === x.productId)!.trackSerial)
            await tx.stockLedger.create({
              data: {
                workspaceId: w.id,
                productId: row.productId,
                toLocationId: row.locationId,
                qtyChange: x.qtyOnHand,
                movementType: "INBOUND_RECEIVE",
                referenceDoc: "TRAINING-OPENING",
                performedBy: a.user.username,
                note: "ยอดตั้งต้นรอบฝึกจากแม่แบบ ไม่ใช่การรับเข้าธุรกิจ",
              },
            });
        }
        for (const x of serials) {
          const row = await tx.serialItem.create({
            data: {
              workspaceId: w.id,
              productId: productIds.get(x.productId)!,
              locationId: locationIds.get(x.locationId!)!,
              serialNumber: x.serialNumber,
              stockLayerId: layerIds.get(x.stockLayerId!)!,
              status: "IN_STOCK",
              lotNumber: x.lotNumber,
              receivedAt: x.receivedAt,
              inboundDocNo: "TRAINING-OPENING",
              warrantyExp: x.warrantyExp,
            },
          });
          await tx.stockLedger.create({
            data: {
              workspaceId: w.id,
              productId: row.productId,
              serialItemId: row.id,
              toLocationId: row.locationId,
              qtyChange: 1,
              movementType: "INBOUND_RECEIVE",
              referenceDoc: "TRAINING-OPENING",
              performedBy: a.user.username,
              note: "ยอดตั้งต้นรอบฝึก",
            },
          });
        }
        for (const m of maps) {
          const graph = MapGraphSchema.parse(JSON.parse(m.graphJson));
          graph.nodes = graph.nodes.map((n) => ({
            ...n,
            ...(n.locationId
              ? { locationId: locationIds.get(n.locationId)! }
              : {}),
          }));
          await tx.warehouseMap.create({
            data: {
              workspaceId: w.id,
              warehouseId: warehouseIds.get(m.warehouseId)!,
              graphJson: JSON.stringify(graph),
              version: m.version,
              updatedBy: a.user.username,
            },
          });
        }
        const shelves: PhysicalShelf[] = [];
        for (const layer of layers) {
          const p = products.find((p) => p.id === layer.productId)!;
          const loc = locations.find((l) => l.id === layer.locationId)!;
          const lot = lots.find((l) => l.id === layer.lotId);
          const existing = shelves.find(
            (r) =>
              r.productId === productIds.get(p.id) &&
              r.locationId === locationIds.get(loc.id) &&
              r.lotNumber === (lot?.number || ""),
          );
          const sns = serials
            .filter((s) => s.stockLayerId === layer.id)
            .map((s) => s.serialNumber);
          if (existing) {
            existing.quantity += layer.qtyOnHand;
            existing.serials.push(...sns);
          } else
            shelves.push({
              productId: productIds.get(p.id)!,
              locationId: locationIds.get(loc.id)!,
              sku: p.sku,
              locationBarcode: loc.barcode,
              lotNumber: lot?.number || "",
              expiresOn: lot?.expiresOn || null,
              quantity: layer.qtyOnHand,
              serials: sns,
            });
        }
        const seed = c.sameSeed ? c.seed : `${c.seed}:group-${index + 1}`;
        let truth;
        try {
          truth = simulateShelves(shelves, c.scenario, seed);
        } catch (e) {
          throw new HttpError(
            400,
            e instanceof Error ? e.message : "สร้างชั้นจำลองไม่ได้",
          );
        }
        if (c.scenario === "URGENT") {
          const eligible = layers
            .filter(
              (x) =>
                ["STORAGE", "PICKING"].includes(
                  locations.find((loc) => loc.id === x.locationId)!.type,
                ) &&
                (!x.lotId ||
                  !lots.find((l) => l.id === x.lotId)?.expiresOn ||
                  lots.find((l) => l.id === x.lotId)!.expiresOn! >=
                    new Date(Date.now() + 7 * 3600000)
                      .toISOString()
                      .slice(0, 10)),
            )
            .sort((x, y) =>
              products
                .find((p) => p.id === x.productId)!
                .sku.localeCompare(
                  products.find((p) => p.id === y.productId)!.sku,
                  "en",
                ),
            );
          if (!eligible.length)
            throw new HttpError(
              400,
              "โจทย์เร่งด่วนต้องมีสินค้าพร้อมหยิบที่ยังไม่หมดอายุ",
            );
          const target =
            eligible[
              Math.floor(seededRandom(`URGENT_V1:${seed}`)() * eligible.length)
            ];
          const p = products.find((p) => p.id === target.productId)!;
          await tx.stockOrder.create({
            data: {
              workspaceId: w.id,
              number: "SIM-URGENT-001",
              createdBy: a.user.username,
              lines: {
                create: {
                  productId: productIds.get(p.id)!,
                  quantity: 1,
                  requestedQuantity: 1,
                  requestedUom: p.baseUom,
                  conversionFactor: 1,
                },
              },
            },
          });
        }
        const round = await tx.trainingRound.create({
          data: {
            lessonId: l.id,
            workspaceId: w.id,
            name: group.name,
            seed,
            fixtureHash,
            configJson: JSON.stringify({ ...c, participants: group.userIds }),
            truthJson: JSON.stringify(truth),
          },
        });
        rounds.push({ id: round.id, workspaceId: w.id });
      }
      await tx.trainingLesson.update({
        where: { id: l.id },
        data: { status: "OPEN" },
      });
      return {
        rounds,
        message: `เปิด ${rounds.length} รอบฝึกแล้ว แยกจากแม่แบบและธุรกิจเสมอ`,
      };
    },
    { timeout: 120_000 },
  );
}
export async function roundAction(raw: unknown, a: WorkspaceAccess) {
  const i = z
    .object({
      operationId: OperationKeySchema,
      action: z.enum(["start", "submit"]),
    })
    .parse(raw);
  return stockOperation(
    a,
    i.operationId,
    { type: `training.${i.action}`, ...i },
    async (tx) => {
      const r = await tx.trainingRound.findUnique({
        where: { workspaceId: a.workspace.id },
      });
      if (!r) throw new HttpError(404, "พื้นที่นี้ไม่ใช่รอบฝึก");
      if (i.action === "start") {
        if (r.status !== "READY")
          throw new HttpError(409, "เริ่มได้เฉพาะรอบที่ยังไม่เริ่ม");
        await tx.trainingRound.update({
          where: { id: r.id },
          data: { status: "ACTIVE", startedAt: new Date() },
        });
        return { message: "เริ่มจับเวลารอบฝึกแล้ว สมาชิกทีมใช้รอบเดียวกัน" };
      }
      if (r.status !== "ACTIVE")
        throw new HttpError(409, "ส่งได้เฉพาะรอบที่กำลังฝึก");
      const c = config(r.configJson);
      if (c.task === "COUNT") {
        const products = await tx.product.findMany({
          where: { workspaceId: a.workspace.id },
          select: { id: true },
        });
        const runs = await tx.countRun.findMany({
          where: {
            workspaceId: a.workspace.id,
            status: { in: ["SUBMITTED", "APPROVED"] },
          },
        });
        if (
          products.some((p) => !runs.some((count) => count.productId === p.id))
        )
          throw new HttpError(
            409,
            "ตรวจนับและส่งผลให้ครบทุก SKU ในรอบก่อนส่งงาน",
          );
      } else if (c.task === "PICK") {
        const orders = await tx.stockOrder.findMany({
          where: { workspaceId: a.workspace.id },
        });
        if (
          !orders.some((o) => o.status === "SHIPPED") ||
          orders.some((o) => !["SHIPPED", "CANCELLED"].includes(o.status))
        )
          throw new HttpError(
            409,
            "ต้องจ่ายอย่างน้อยหนึ่งคำสั่งซื้อและปิดเอกสารค้างก่อนส่งงาน",
          );
      } else {
        const count = await tx.trainingEvent.count({
          where: {
            roundId: r.id,
            success: true,
            actorRole: "STUDENT",
            type: c.task === "RECEIVE" ? "receive" : "transfer",
          },
        });
        if (!count)
          throw new HttpError(409, "ยังไม่มีหลักฐานทำงานของผู้เรียนในรอบนี้");
      }
      await tx.trainingRound.update({
        where: { id: r.id },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      return { message: "ส่งงานแล้ว หยุดเวลาและรอผู้สอนตรวจหลักฐาน" };
    },
  );
}
export async function shelfData(a: WorkspaceAccess, barcode: string) {
  const r = await prisma.trainingRound.findUnique({
    where: { workspaceId: a.workspace.id },
  });
  if (!r || r.status !== "ACTIVE" || config(r.configJson).task !== "COUNT")
    throw new HttpError(403, "ชั้นจำลองเปิดเฉพาะงานตรวจนับที่กำลังฝึก");
  const loc = await prisma.location.findFirst({
    where: { workspaceId: a.workspace.id, barcode },
  });
  if (!loc) throw new HttpError(404, "ไม่พบตำแหน่งในรอบนี้");
  return {
    locationBarcode: barcode,
    items: (JSON.parse(r.truthJson) as PhysicalShelf[]).filter(
      (row) => row.locationId === loc.id,
    ),
    message: "สินค้าในชั้นจำลองสำหรับฝึก ไม่ใช่ยอดอ้างอิงในบัญชี",
  };
}
export async function reviewRound(raw: unknown, a: WorkspaceAccess) {
  requireInstructor(a);
  const i = z
    .object({
      operationId: OperationKeySchema,
      userId: z.string().min(1),
      decision: z.enum(["COMPETENT", "NOT_YET", "INCOMPLETE"]),
      note: z.string().trim().min(5).max(5000),
      criteria: z
        .array(
          z.object({
            id: z.string().min(1),
            result: z.enum(["MET", "NOT_MET", "MISSING"]),
            evidence: z
              .string()
              .trim()
              .min(3, "ระบุหลักฐานรายเกณฑ์อย่างน้อย 3 ตัวอักษร")
              .max(2000),
          }),
        )
        .min(1)
        .max(50),
    })
    .parse(raw);
  return stockOperation(
    a,
    i.operationId,
    { type: "training.review", ...i },
    async (tx) => {
      const r = await tx.trainingRound.findUnique({
        where: { workspaceId: a.workspace.id },
      });
      if (!r || r.status !== "SUBMITTED")
        throw new HttpError(409, "ตรวจได้เฉพาะรอบที่ส่งงานแล้ว");
      const c = config(r.configJson);
      if (
        i.criteria.length !== c.criteria.length ||
        new Set(i.criteria.map((x) => x.id)).size !== i.criteria.length ||
        c.criteria.some((x) => !i.criteria.some((y) => y.id === x.id))
      )
        throw new HttpError(400, "ตรวจเกณฑ์ที่อนุมัติไว้ให้ครบทุกข้อ");
      if (
        i.decision === "COMPETENT" &&
        c.criteria.some(
          (x) =>
            x.required &&
            i.criteria.find((y) => y.id === x.id)?.result !== "MET",
        )
      )
        throw new HttpError(
          400,
          "ผ่านได้เมื่อเกณฑ์จำเป็นทุกข้อมีหลักฐานและผ่านการตรวจผู้สอน",
        );
      const participantIds: string[] =
        JSON.parse(r.configJson).participants || [];
      if (!participantIds.includes(i.userId))
        throw new HttpError(400, "ผู้เรียนไม่ได้อยู่ในรอบนี้");
      const assessments: Assessment[] = r.assessmentJson
        ? JSON.parse(r.assessmentJson)
        : [];
      if (assessments.some((record) => record.userId === i.userId))
        throw new HttpError(
          409,
          "ผู้เรียนคนนี้มีผลประเมินแล้ว ไม่แก้ทับผลเดิม",
        );
      const person = await tx.user.findUniqueOrThrow({
        where: { id: i.userId },
        select: { username: true, displayName: true },
      });
      assessments.push({
        userId: i.userId,
        ...person,
        decision: i.decision,
        note: i.note,
        criteria: i.criteria,
        reviewedBy: a.user.username,
        reviewedAt: new Date().toISOString(),
      });
      const complete = participantIds.every((id) =>
        assessments.some((record) => record.userId === id),
      );
      await tx.trainingRound.update({
        where: { id: r.id },
        data: {
          status: complete ? "REVIEWED" : "SUBMITTED",
          assessmentJson: JSON.stringify(assessments),
          ...(complete
            ? { reviewedAt: new Date(), reviewedBy: a.user.username }
            : {}),
        },
      });
      return {
        message: complete
          ? "บันทึกสมรรถนะรายบุคคลครบแล้ว เป็นผลของโจทย์ในระบบ ไม่ใช่ใบรับรอง TPQI"
          : "บันทึกผลรายบุคคลแล้ว รอผู้สอนตรวจสมาชิกที่เหลือ",
      };
    },
  );
}
export async function exportTraining(a: WorkspaceAccess) {
  requireInstructor(a);
  const rounds = await prisma.trainingRound.findMany({
    where: {
      OR: [
        { workspaceId: a.workspace.id },
        { lesson: { workspaceId: a.workspace.id } },
      ],
    },
    include: {
      lesson: { select: { title: true, workspaceId: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows: unknown[][] = [
    [
      "lesson",
      "round_id",
      "round_name",
      "mode",
      "seed",
      "fixture_hash",
      "status",
      "respondent_code",
      "elapsed_seconds_team_or_individual",
      "validated_pick_commands",
      "correct_pick_commands",
      "pick_command_accuracy_percent",
      "competency_decision_individual",
      "instructor_note",
      "criteria_evidence",
      "reviewed_by",
    ],
  ];
  for (const r of rounds) {
    const c = config(r.configJson),
      m = roundMetrics(r),
      ids: string[] = JSON.parse(r.configJson).participants || [],
      assessments: Assessment[] = r.assessmentJson
        ? JSON.parse(r.assessmentJson)
        : [];
    for (const userId of ids) {
      const assessment = assessments.find((x) => x.userId === userId);
      const code = createHash("sha256")
        .update(`${r.lesson.workspaceId}:${userId}`)
        .digest("hex")
        .slice(0, 16);
      rows.push([
        r.lesson.title,
        r.id,
        r.name,
        c.mode,
        r.seed,
        r.fixtureHash,
        r.status,
        code,
        m.elapsedSeconds,
        m.validatedPickCommands,
        m.correctPickCommands,
        m.pickCommandAccuracy,
        assessment?.decision,
        assessment?.note,
        assessment ? JSON.stringify(assessment.criteria) : "",
        assessment?.reviewedBy,
      ]);
    }
  }
  return csvText(rows);
}
