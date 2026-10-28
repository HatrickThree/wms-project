import { z } from "zod";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import { requireStockOperator } from "@/lib/warehouse-permissions";
import {
  OperationKeySchema,
  QuantitySchema,
} from "@/lib/validations/stock.schema";
import { stockOperation } from "./stock-operation";
import { convertToBase } from "./units";
import { requireUnlockedProducts } from "./count-lock";
export const TransferStockSchema = z.object({
  operationId: OperationKeySchema,
  referenceDoc: z.string().trim().min(3).max(100),
  layerId: z.string().min(1),
  fromLocationBarcode: z.string().trim().min(1),
  toLocationBarcode: z.string().trim().min(1),
  quantity: QuantitySchema,
  unitId: z.string().min(1).optional(),
  serialNumbers: z
    .array(z.string().trim().min(3).max(256))
    .max(500)
    .default([]),
});
export async function transferStock(input: unknown, access: WorkspaceAccess) {
  requireStockOperator(access);
  const data = TransferStockSchema.parse(input);
  return stockOperation(
    access,
    data.operationId,
    { type: "transfer", ...data },
    async (tx) => {
      const workspaceId = access.workspace.id;
      const layer = await tx.stockLayer.findFirst({
        where: { id: data.layerId, workspaceId },
        include: { product: true, location: true, lot: true },
      });
      if (!layer) throw new HttpError(404, "ไม่พบรอบรับเข้าในพื้นที่นี้");
      await requireUnlockedProducts(tx, workspaceId, [layer.productId]);
      if (layer.location.barcode !== data.fromLocationBarcode)
        throw new HttpError(400, "ชั้นวางต้นทางไม่ตรงกับรอบรับเข้าที่เลือก");
      const to = await tx.location.findUnique({
        where: {
          workspaceId_barcode: { workspaceId, barcode: data.toLocationBarcode },
        },
      });
      if (!to) throw new HttpError(400, "ไม่พบตำแหน่งปลายทางในพื้นที่นี้");
      if (to.id === layer.locationId)
        throw new HttpError(400, "ต้นทางและปลายทางต้องต่างกัน");
      if (layer.location.type === "QUARANTINE" && to.type !== "QUARANTINE")
        throw new HttpError(
          400,
          "ยังไม่เปิดขั้นตอนปล่อยสินค้าจากกักกัน กรุณาคงสินค้าไว้ในพื้นที่กักกัน",
        );
      const unit = await convertToBase(
        tx,
        layer.product,
        data.quantity,
        data.unitId,
      );
      const amount = unit.baseQuantity;
      if (layer.qtyOnHand - layer.qtyAllocated < amount)
        throw new HttpError(
          400,
          "ยอดที่ไม่จองในรอบรับเข้านี้ไม่พอ ห้ามย้ายยอดที่จองหรือหยิบแล้ว",
        );
      if (
        layer.product.trackSerial &&
        (data.serialNumbers.length !== amount ||
          new Set(data.serialNumbers).size !== amount)
      )
        throw new HttpError(
          400,
          "จำนวน Serial ต้องตรงกับหน่วยหลักที่ย้ายและไม่ซ้ำกัน",
        );
      if (!layer.product.trackSerial && data.serialNumbers.length)
        throw new HttpError(400, "สินค้านี้ไม่ควบคุม Serial");
      const serials = layer.product.trackSerial
        ? await tx.serialItem.findMany({
            where: {
              workspaceId,
              stockLayerId: layer.id,
              locationId: layer.locationId,
              serialNumber: { in: data.serialNumbers },
              status: { in: ["IN_STOCK", "RETURNED", "DEFECTIVE"] },
            },
          })
        : [];
      if (layer.product.trackSerial && serials.length !== amount)
        throw new HttpError(
          400,
          "มี Serial ไม่อยู่ต้นทาง/รอบรับเข้านี้ หรืออยู่ในสถานะจอง/หยิบแล้ว",
        );
      const balance = await tx.inventoryBalance.findUnique({
        where: {
          productId_locationId: {
            productId: layer.productId,
            locationId: layer.locationId,
          },
        },
      });
      if (!balance || balance.qtyOnHand - balance.qtyAllocated < amount)
        throw new HttpError(409, "ยอดรวมต้นทางไม่พอหรือไม่ตรงกับรอบรับเข้า");
      if (
        (
          await tx.stockLayer.updateMany({
            where: {
              id: layer.id,
              qtyOnHand: layer.qtyOnHand,
              qtyAllocated: layer.qtyAllocated,
            },
            data: { qtyOnHand: { decrement: amount } },
          })
        ).count !== 1
      )
        throw new HttpError(409, "ยอดรอบรับเข้าเปลี่ยนไป");
      if (
        (
          await tx.inventoryBalance.updateMany({
            where: {
              id: balance.id,
              qtyOnHand: balance.qtyOnHand,
              qtyAllocated: balance.qtyAllocated,
            },
            data: { qtyOnHand: { decrement: amount } },
          })
        ).count !== 1
      )
        throw new HttpError(409, "ยอดรวมต้นทางเปลี่ยนไป");
      const destination = await tx.stockLayer.create({
        data: {
          workspaceId,
          productId: layer.productId,
          locationId: to.id,
          lotId: layer.lotId,
          receivedAt: layer.receivedAt,
          referenceDoc: layer.referenceDoc,
          qtyOnHand: amount,
        },
      });
      await tx.inventoryBalance.upsert({
        where: {
          productId_locationId: {
            productId: layer.productId,
            locationId: to.id,
          },
        },
        create: {
          workspaceId,
          productId: layer.productId,
          locationId: to.id,
          qtyOnHand: amount,
        },
        update: { qtyOnHand: { increment: amount } },
      });
      const movementType =
        layer.location.type === "RECEIVING" &&
        ["STORAGE", "PICKING"].includes(to.type)
          ? "PUTAWAY"
          : "INTERNAL_TRANSFER";
      const note = `${layer.location.barcode} → ${to.barcode} · Lot ${layer.lot?.number || "-"} · ${data.quantity} ${unit.name} = ${amount} ${layer.product.baseUom} · คงวันรับเข้าเดิม`;
      for (const serial of serials) {
        if (
          (
            await tx.serialItem.updateMany({
              where: {
                id: serial.id,
                stockLayerId: layer.id,
                locationId: layer.locationId,
                status: serial.status,
              },
              data: { stockLayerId: destination.id, locationId: to.id },
            })
          ).count !== 1
        )
          throw new HttpError(409, "Serial เปลี่ยนไปแล้ว");
        await tx.stockLedger.create({
          data: {
            workspaceId,
            productId: layer.productId,
            serialItemId: serial.id,
            fromLocationId: layer.locationId,
            toLocationId: to.id,
            qtyChange: 1,
            movementType,
            referenceDoc: data.referenceDoc,
            performedBy: access.user.username,
            note,
          },
        });
      }
      if (!layer.product.trackSerial)
        await tx.stockLedger.create({
          data: {
            workspaceId,
            productId: layer.productId,
            fromLocationId: layer.locationId,
            toLocationId: to.id,
            qtyChange: amount,
            movementType,
            referenceDoc: data.referenceDoc,
            performedBy: access.user.username,
            note,
          },
        });
      return {
        sourceLayerId: layer.id,
        destinationLayerId: destination.id,
        movedCount: amount,
        baseUom: layer.product.baseUom,
        from: layer.location.barcode,
        to: to.barcode,
        movementType,
      };
    },
  );
}
