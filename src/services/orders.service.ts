import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import {
  requireStockApproval,
  requireStockOperator,
} from "@/lib/warehouse-permissions";
import {
  CreateOrderSchema,
  OrderActionSchema,
} from "@/lib/validations/stock.schema";
import { businessToday, stockOperation } from "./stock-operation";
import { convertToBase } from "./units";
import { requireUnlockedProducts } from "./count-lock";

const orderInclude = {
  lines: {
    include: {
      product: true,
      allocations: {
        include: {
          stockLayer: { include: { location: true, lot: true } },
          serialItem: { select: { serialNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.StockOrderInclude;
export async function getOrders(access: WorkspaceAccess) {
  const where = { workspaceId: access.workspace.id };
  const [orders, count] = await Promise.all([
    prisma.stockOrder.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.stockOrder.count({ where }),
  ]);
  return { orders, count, limit: 100 };
}
export async function createOrder(input: unknown, access: WorkspaceAccess) {
  requireStockOperator(access);
  const data = CreateOrderSchema.parse(input);
  if (new Set(data.lines.map((l) => l.productId)).size !== data.lines.length)
    throw new HttpError(400, "สินค้าแต่ละ SKU ต้องอยู่ในบรรทัดเดียวกัน");
  return stockOperation(
    access,
    data.operationId,
    { type: "create-order", ...data },
    async (tx) => {
      const products = await tx.product.findMany({
        where: {
          id: { in: data.lines.map((l) => l.productId) },
          workspaceId: access.workspace.id,
        },
      });
      if (products.length !== data.lines.length)
        throw new HttpError(400, "มีสินค้าที่ไม่อยู่ในพื้นที่นี้");
      const lines = [];
      for (const line of data.lines) {
        const product = products.find((p) => p.id === line.productId)!;
        const unit = await convertToBase(
          tx,
          product,
          line.quantity,
          line.unitId,
        );
        if (product.trackSerial && unit.baseQuantity > 500)
          throw new HttpError(
            400,
            "สินค้าควบคุม Serial รองรับไม่เกิน 500 ชิ้นต่อบรรทัด",
          );
        lines.push({
          productId: product.id,
          quantity: unit.baseQuantity,
          requestedQuantity: line.quantity,
          requestedUom: unit.name,
          conversionFactor: unit.factor,
        });
      }
      return tx.stockOrder.create({
        data: {
          workspaceId: access.workspace.id,
          number: data.number,
          createdBy: access.user.username,
          lines: { create: lines },
        },
        include: orderInclude,
      });
    },
  );
}
export async function actOnOrder(
  id: string,
  input: unknown,
  access: WorkspaceAccess,
) {
  requireStockOperator(access);
  const data = OrderActionSchema.parse(input);
  return stockOperation(
    access,
    data.operationId,
    { type: "order-action", orderId: id, ...data },
    async (tx) => {
      const order = await tx.stockOrder.findFirst({
        where: { id, workspaceId: access.workspace.id },
        include: orderInclude,
      });
      if (!order) throw new HttpError(404, "ไม่พบคำสั่งซื้อในพื้นที่นี้");
      const workspaceId = access.workspace.id;
      if (data.action !== "cancel" || order.status !== "DRAFT")
        await requireUnlockedProducts(
          tx,
          workspaceId,
          order.lines.map((line) => line.productId),
        );
      if (data.action === "reserve") {
        if (order.status !== "DRAFT")
          throw new HttpError(409, "จองได้เฉพาะคำสั่งซื้อฉบับร่าง");
        if (data.preferredLayers.length) {
          requireStockApproval(access);
          if (!data.reason || data.reason.length < 5)
            throw new HttpError(
              400,
              "การข้ามลำดับต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร",
            );
          if (
            new Set(data.preferredLayers).size !== data.preferredLayers.length
          )
            throw new HttpError(400, "รายการรอบรับเข้าซ้ำกัน");
        }
        const validPreferences = new Set<string>();
        for (const line of order.lines) {
          const product = line.product;
          const layers = await tx.stockLayer.findMany({
            where: {
              workspaceId,
              productId: product.id,
              qtyOnHand: { gt: 0 },
              location: { type: { in: ["STORAGE", "PICKING"] } },
              OR: [
                { lotId: null },
                { lot: { expiresOn: null } },
                { lot: { expiresOn: { gte: businessToday() } } },
              ],
            },
            include: { lot: true, location: true },
          });
          const eligible = layers.filter(
            (l) => product.issuePolicy !== "FEFO" || !!l.lot?.expiresOn,
          );
          eligible.forEach((l) => {
            if (data.preferredLayers.includes(l.id)) validPreferences.add(l.id);
          });
          const preference = (layerId: string) => {
            const i = data.preferredLayers.indexOf(layerId);
            return i < 0 ? Number.MAX_SAFE_INTEGER : i;
          };
          eligible.sort(
            (a, b) =>
              preference(a.id) - preference(b.id) ||
              (product.issuePolicy === "FEFO"
                ? a.lot!.expiresOn!.localeCompare(b.lot!.expiresOn!)
                : 0) ||
              a.receivedAt.getTime() - b.receivedAt.getTime() ||
              a.id.localeCompare(b.id),
          );
          let remaining = line.quantity;
          for (const layer of eligible) {
            if (!remaining) break;
            let amount = Math.min(
              remaining,
              layer.qtyOnHand - layer.qtyAllocated,
            );
            if (amount <= 0) continue;
            const serials = product.trackSerial
              ? await tx.serialItem.findMany({
                  where: {
                    workspaceId,
                    stockLayerId: layer.id,
                    locationId: layer.locationId,
                    status: "IN_STOCK",
                  },
                  orderBy: [{ receivedAt: "asc" }, { serialNumber: "asc" }],
                  take: amount,
                })
              : [];
            if (product.trackSerial) amount = serials.length;
            if (!amount) continue;
            if (
              (
                await tx.stockLayer.updateMany({
                  where: {
                    id: layer.id,
                    qtyOnHand: layer.qtyOnHand,
                    qtyAllocated: layer.qtyAllocated,
                  },
                  data: { qtyAllocated: { increment: amount } },
                })
              ).count !== 1
            )
              throw new HttpError(
                409,
                "สต็อกเปลี่ยนระหว่างจอง กรุณาลองรายการเดิมอีกครั้ง",
              );
            const balance = await tx.inventoryBalance.findUnique({
              where: {
                productId_locationId: {
                  productId: product.id,
                  locationId: layer.locationId,
                },
              },
            });
            if (!balance || balance.qtyOnHand - balance.qtyAllocated < amount)
              throw new HttpError(
                409,
                "ยอดรวมกับรอบรับเข้าไม่ตรงกัน กรุณาตรวจนับก่อน",
              );
            if (
              (
                await tx.inventoryBalance.updateMany({
                  where: {
                    id: balance.id,
                    qtyOnHand: balance.qtyOnHand,
                    qtyAllocated: balance.qtyAllocated,
                  },
                  data: { qtyAllocated: { increment: amount } },
                })
              ).count !== 1
            )
              throw new HttpError(409, "ยอดจองเปลี่ยนไป กรุณาลองอีกครั้ง");
            const override = data.preferredLayers.length
              ? {
                  overrideBy: access.user.username,
                  overrideReason: data.reason,
                }
              : {};
            if (product.trackSerial)
              for (const serial of serials) {
                if (
                  (
                    await tx.serialItem.updateMany({
                      where: {
                        id: serial.id,
                        status: "IN_STOCK",
                        locationId: layer.locationId,
                      },
                      data: { status: "ALLOCATED" },
                    })
                  ).count !== 1
                )
                  throw new HttpError(409, "Serial ถูกจองไปแล้ว");
                await tx.stockAllocation.create({
                  data: {
                    orderLineId: line.id,
                    stockLayerId: layer.id,
                    serialItemId: serial.id,
                    quantity: 1,
                    ...override,
                  },
                });
              }
            else
              await tx.stockAllocation.create({
                data: {
                  orderLineId: line.id,
                  stockLayerId: layer.id,
                  quantity: amount,
                  ...override,
                },
              });
            remaining -= amount;
          }
          if (remaining)
            throw new HttpError(
              400,
              `${product.sku}: สต็อกที่จ่ายได้ไม่พอ ขาด ${remaining} ${product.baseUom} (ไม่รวมหมดอายุ กักกัน รับเข้า/แพ็ค และยอดจองอื่น)`,
            );
        }
        if (validPreferences.size !== data.preferredLayers.length)
          throw new HttpError(
            400,
            "รอบรับเข้าที่เลือกไม่ใช่สต็อกที่จ่ายได้ของคำสั่งซื้อนี้",
          );
        await tx.stockOrder.update({
          where: { id },
          data: { status: "RESERVED", reservedAt: new Date() },
        });
      } else if (data.action === "pick") {
        if (order.status !== "RESERVED")
          throw new HttpError(
            409,
            "คำสั่งซื้อนี้ยังไม่พร้อมหยิบหรือหยิบครบแล้ว",
          );
        const allocation = order.lines
          .flatMap((l) => l.allocations)
          .find((a) => a.id === data.allocationId);
        if (!allocation || allocation.pickedAt)
          throw new HttpError(
            409,
            "รายการนี้ไม่อยู่ในคำสั่งซื้อหรือหยิบไปแล้ว",
          );
        if (
          allocation.quantity !== data.quantity ||
          allocation.stockLayer.location.barcode !== data.locationBarcode
        )
          throw new HttpError(400, "จำนวนหรือชั้นวางไม่ตรงกับใบหยิบ");
        if (
          allocation.serialItem &&
          allocation.serialItem.serialNumber !== data.serialNumber
        )
          throw new HttpError(400, "Serial ไม่ตรงกับหน่วยที่จองไว้");
        if (!allocation.serialItem && data.serialNumber)
          throw new HttpError(400, "รายการนี้ไม่ควบคุม Serial");
        if (
          allocation.stockLayer.lot?.expiresOn &&
          allocation.stockLayer.lot.expiresOn < businessToday()
        )
          throw new HttpError(400, "สินค้าหมดอายุแล้ว ห้ามหยิบเพื่อจ่าย");
        if (
          allocation.serialItemId &&
          (
            await tx.serialItem.updateMany({
              where: {
                id: allocation.serialItemId,
                status: "ALLOCATED",
                locationId: allocation.stockLayer.locationId,
              },
              data: { status: "PICKED" },
            })
          ).count !== 1
        )
          throw new HttpError(
            409,
            "Serial ไม่อยู่ในสถานะจองหรือตำแหน่งเปลี่ยนไป",
          );
        if (
          (
            await tx.stockAllocation.updateMany({
              where: { id: allocation.id, pickedAt: null },
              data: { pickedAt: new Date(), pickedBy: access.user.username },
            })
          ).count !== 1
        )
          throw new HttpError(409, "รายการนี้ถูกหยิบไปแล้ว");
        if (
          !(await tx.stockAllocation.count({
            where: { orderLine: { orderId: id }, pickedAt: null },
          }))
        )
          await tx.stockOrder.update({
            where: { id },
            data: { status: "PICKED" },
          });
      } else if (data.action === "ship") {
        if (order.status !== "PICKED")
          throw new HttpError(409, "ต้องหยิบให้ครบก่อนยืนยันจ่ายออก");
        for (const line of order.lines)
          for (const allocation of line.allocations) {
            const layer = allocation.stockLayer;
            const quantity = allocation.quantity;
            if (
              !allocation.pickedAt ||
              (layer.lot?.expiresOn && layer.lot.expiresOn < businessToday())
            )
              throw new HttpError(
                400,
                "มีรายการยังไม่หยิบหรือหมดอายุแล้ว ไม่สามารถยืนยันจ่ายได้",
              );
            if (
              (
                await tx.stockLayer.updateMany({
                  where: {
                    id: layer.id,
                    qtyOnHand: { gte: quantity },
                    qtyAllocated: { gte: quantity },
                  },
                  data: {
                    qtyOnHand: { decrement: quantity },
                    qtyAllocated: { decrement: quantity },
                  },
                })
              ).count !== 1
            )
              throw new HttpError(409, "ยอดรอบรับเข้าไม่พอ กรุณาตรวจสอบ");
            if (
              (
                await tx.inventoryBalance.updateMany({
                  where: {
                    workspaceId,
                    productId: line.productId,
                    locationId: layer.locationId,
                    qtyOnHand: { gte: quantity },
                    qtyAllocated: { gte: quantity },
                  },
                  data: {
                    qtyOnHand: { decrement: quantity },
                    qtyAllocated: { decrement: quantity },
                  },
                })
              ).count !== 1
            )
              throw new HttpError(409, "ยอดรวมไม่พอ กรุณาตรวจสอบ");
            if (
              allocation.serialItemId &&
              (
                await tx.serialItem.updateMany({
                  where: {
                    id: allocation.serialItemId,
                    status: "PICKED",
                    locationId: layer.locationId,
                  },
                  data: {
                    status: "SHIPPED",
                    locationId: null,
                    outboundDocNo: order.number,
                    shippedAt: new Date(),
                  },
                })
              ).count !== 1
            )
              throw new HttpError(409, "Serial ไม่พร้อมจ่าย กรุณาตรวจสอบ");
            await tx.stockLedger.create({
              data: {
                workspaceId,
                productId: line.productId,
                serialItemId: allocation.serialItemId,
                fromLocationId: layer.locationId,
                qtyChange: -quantity,
                movementType: "OUTBOUND_SHIP",
                referenceDoc: order.number,
                performedBy: access.user.username,
                note: `Lot ${layer.lot?.number || "-"} · ยืนยันจ่ายหลังหยิบ${allocation.overrideReason ? ` · ข้อยกเว้น: ${allocation.overrideReason} (${allocation.overrideBy})` : ""}`,
              },
            });
          }
        await tx.stockOrder.update({
          where: { id },
          data: { status: "SHIPPED", shippedAt: new Date() },
        });
      } else {
        if (
          !["DRAFT", "RESERVED"].includes(order.status) ||
          order.lines.some((l) => l.allocations.some((a) => a.pickedAt))
        )
          throw new HttpError(
            409,
            "ยกเลิกได้ก่อนเริ่มหยิบเท่านั้น รายการที่หยิบแล้วต้องจัดการคืนตำแหน่งก่อน",
          );
        for (const line of order.lines)
          for (const allocation of line.allocations) {
            const layer = allocation.stockLayer;
            const quantity = allocation.quantity;
            if (
              (
                await tx.stockLayer.updateMany({
                  where: { id: layer.id, qtyAllocated: { gte: quantity } },
                  data: { qtyAllocated: { decrement: quantity } },
                })
              ).count !== 1
            )
              throw new HttpError(409, "ยอดจองไม่ตรงกัน");
            if (
              (
                await tx.inventoryBalance.updateMany({
                  where: {
                    productId: line.productId,
                    locationId: layer.locationId,
                    qtyAllocated: { gte: quantity },
                  },
                  data: { qtyAllocated: { decrement: quantity } },
                })
              ).count !== 1
            )
              throw new HttpError(409, "ยอดรวมจองไม่ตรงกัน");
            if (
              allocation.serialItemId &&
              (
                await tx.serialItem.updateMany({
                  where: { id: allocation.serialItemId, status: "ALLOCATED" },
                  data: { status: "IN_STOCK" },
                })
              ).count !== 1
            )
              throw new HttpError(409, "Serial ไม่อยู่ในสถานะจอง");
          }
        await tx.stockOrder.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
      }
      return tx.stockOrder.findUniqueOrThrow({
        where: { id },
        include: orderInclude,
      });
    },
  );
}
