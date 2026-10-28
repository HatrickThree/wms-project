import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import { requireMasterDataAccess } from "@/lib/warehouse-permissions";
import {
  MapGraphSchema,
  suggestedGraph,
  calculatePickingRoute,
} from "@/lib/warehouse-map";
import { OperationKeySchema } from "@/lib/validations/stock.schema";
import { stockOperation } from "./stock-operation";

export async function mapData(
  access: WorkspaceAccess,
  warehouseId?: string | null,
) {
  const warehouses = await prisma.warehouse.findMany({
    where: { workspaceId: access.workspace.id },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const selected = warehouseId || warehouses[0]?.id;
  if (selected && !warehouses.some((w) => w.id === selected))
    throw new HttpError(404, "ไม่พบคลังในพื้นที่นี้");
  const [locations, map, orders, plans] = await Promise.all([
    selected
      ? prisma.location.findMany({
          where: { warehouseId: selected, workspaceId: access.workspace.id },
          select: { id: true, barcode: true, type: true },
          orderBy: { barcode: "asc" },
        })
      : [],
    selected
      ? prisma.warehouseMap.findFirst({
          where: { warehouseId: selected, workspaceId: access.workspace.id },
        })
      : null,
    prisma.stockOrder.findMany({
      where: {
        workspaceId: access.workspace.id,
        status: { in: ["RESERVED", "PICKED"] },
      },
      select: { id: true, number: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    selected
      ? prisma.pickingPlan.findMany({
          where: { workspaceId: access.workspace.id, warehouseId: selected },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [],
  ]);
  return {
    warehouses,
    warehouseId: selected || "",
    locations,
    map: map
      ? {
          version: map.version,
          graph: MapGraphSchema.parse(JSON.parse(map.graphJson)),
          updatedBy: map.updatedBy,
        }
      : null,
    orders,
    plans: plans.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      mapVersion: p.mapVersion,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      snapshot: JSON.parse(p.snapshotJson),
      result: JSON.parse(p.resultJson),
    })),
  };
}
const SaveSchema = z.object({
  operationId: OperationKeySchema,
  warehouseId: z.string().min(1),
  expectedVersion: z.number().int().min(0),
  graph: MapGraphSchema,
});
export async function saveMap(raw: unknown, access: WorkspaceAccess) {
  requireMasterDataAccess(access);
  const input = SaveSchema.parse(raw);
  return stockOperation(
    access,
    input.operationId,
    { type: "map.save", ...input },
    async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: input.warehouseId, workspaceId: access.workspace.id },
      });
      if (!warehouse) throw new HttpError(404, "ไม่พบคลังในพื้นที่นี้");
      const locationIds = input.graph.nodes.flatMap((n) =>
        n.locationId ? [n.locationId] : [],
      );
      const count = await tx.location.count({
        where: {
          workspaceId: access.workspace.id,
          warehouseId: warehouse.id,
          id: { in: locationIds },
        },
      });
      if (count !== locationIds.length)
        throw new HttpError(
          400,
          "จุดหยิบต้องเป็นตำแหน่งในคลังและพื้นที่นี้เท่านั้น",
        );
      const existing = await tx.warehouseMap.findUnique({
        where: { warehouseId: warehouse.id },
      });
      if ((existing?.version || 0) !== input.expectedVersion)
        throw new HttpError(
          409,
          "ผังถูกแก้ไขแล้ว โหลดข้อมูลล่าสุดก่อนบันทึกใหม่",
        );
      const data = {
        graphJson: JSON.stringify(input.graph),
        updatedBy: access.user.username,
        version: input.expectedVersion + 1,
      };
      if (existing) {
        const changed = await tx.warehouseMap.updateMany({
          where: { id: existing.id, version: input.expectedVersion },
          data,
        });
        if (changed.count !== 1)
          throw new HttpError(409, "ผังเปลี่ยนไปแล้ว กรุณาโหลดใหม่");
      } else
        await tx.warehouseMap.create({
          data: {
            ...data,
            workspaceId: access.workspace.id,
            warehouseId: warehouse.id,
          },
        });
      return {
        version: data.version,
        message: "บันทึกผังจำลองแล้ว ยอดสต็อกไม่เปลี่ยน",
      };
    },
  );
}
export async function generateMap(raw: unknown, access: WorkspaceAccess) {
  requireMasterDataAccess(access);
  const input = z.object({ warehouseId: z.string().min(1) }).parse(raw);
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: input.warehouseId, workspaceId: access.workspace.id },
  });
  if (!warehouse) throw new HttpError(404, "ไม่พบคลังในพื้นที่นี้");
  const locations = await prisma.location.findMany({
    where: { warehouseId: warehouse.id, workspaceId: access.workspace.id },
    select: { id: true, barcode: true },
    orderBy: { barcode: "asc" },
  });
  if (locations.length > 130)
    throw new HttpError(
      400,
      "ผังเริ่มต้นรองรับไม่เกิน 130 ตำแหน่ง กรุณาจัดผังเป็นโซนก่อน",
    );
  return suggestedGraph(locations);
}
export async function createPickingPlan(raw: unknown, access: WorkspaceAccess) {
  if (access.user.role === "STUDENT" && access.trainingRound?.status !== "ACTIVE")
    throw new HttpError(403, "ผู้เรียนต้องเริ่มรอบฝึกที่เปิดให้ก่อน");
  const input = z
    .object({
      operationId: OperationKeySchema,
      warehouseId: z.string().min(1),
      orderId: z.string().min(1),
      expectedVersion: z.number().int().positive(),
    })
    .parse(raw);
  return stockOperation(
    access,
    input.operationId,
    { type: "map.route", ...input },
    async (tx) => {
      const map = await tx.warehouseMap.findFirst({
        where: {
          workspaceId: access.workspace.id,
          warehouseId: input.warehouseId,
        },
      });
      if (!map) throw new HttpError(409, "บันทึกผังคลังก่อนสร้างเส้นทาง");
      if (map.version !== input.expectedVersion)
        throw new HttpError(409, "ผังเปลี่ยนไปแล้ว โหลดข้อมูลก่อนคำนวณใหม่");
      const order = await tx.stockOrder.findFirst({
        where: { id: input.orderId, workspaceId: access.workspace.id },
        include: {
          lines: {
            include: {
              product: { select: { sku: true, name: true, baseUom: true } },
              allocations: {
                include: {
                  stockLayer: { include: { location: true } },
                  serialItem: { select: { serialNumber: true } },
                },
              },
            },
          },
        },
      });
      if (!order || !["RESERVED", "PICKED"].includes(order.status))
        throw new HttpError(409, "ต้องเป็นคำสั่งซื้อที่จองแล้วและยังไม่จ่าย");
      const items = order.lines.flatMap((line) =>
        line.allocations
          .filter(
            (a) =>
              a.stockLayer.location.warehouseId === input.warehouseId &&
              !a.pickedAt,
          )
          .map((a) => ({
            allocationId: a.id,
            sku: line.product.sku,
            name: line.product.name,
            quantity: a.quantity,
            uom: line.product.baseUom,
            locationId: a.stockLayer.locationId,
            locationBarcode: a.stockLayer.location.barcode,
            serialNumber: a.serialItem?.serialNumber || null,
          })),
      );
      if (!items.length)
        throw new HttpError(
          409,
          "ไม่มีรายการที่ยังไม่หยิบในคลังนี้ เลือกคำสั่งซื้อหรือคลังอื่น",
        );
      const graph = MapGraphSchema.parse(JSON.parse(map.graphJson));
      let result;
      try {
        result = calculatePickingRoute(
          graph,
          items.map((i) => i.locationId),
        );
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "คำนวณทางเดินไม่ได้",
        );
      }
      const plan = await tx.pickingPlan.create({
        data: {
          workspaceId: access.workspace.id,
          orderId: order.id,
          warehouseId: input.warehouseId,
          mapVersion: map.version,
          snapshotJson: JSON.stringify({
            graph,
            orderNumber: order.number,
            items,
          }),
          resultJson: JSON.stringify(result),
          createdBy: access.user.username,
        },
      });
      return {
        id: plan.id,
        message: `บันทึกเส้นทางตามผัง ${result.distanceMeters.toFixed(2)} เมตรแล้ว เป็นค่าคำนวณ ไม่ใช่ระยะเดินที่วัดจริง`,
      };
    },
  );
}
