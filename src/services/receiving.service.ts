import { ReceiptSchema } from "@/lib/validations/stock.schema";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import { requireStockOperator } from "@/lib/warehouse-permissions";
import { stockOperation } from "./stock-operation";
import { convertToBase } from "./units";
import { requireUnlockedProducts } from "./count-lock";

export async function receiveStock(input: unknown, access: WorkspaceAccess) {
  requireStockOperator(access);
  const data = ReceiptSchema.parse(input);
  return stockOperation(
    access,
    data.operationId,
    { type: "receive", ...data },
    async (tx) => {
      const workspaceId = access.workspace.id;
      const product = await tx.product.findUnique({
        where: { workspaceId_sku: { workspaceId, sku: data.sku } },
      });
      const location = await tx.location.findUnique({
        where: {
          workspaceId_barcode: { workspaceId, barcode: data.locationBarcode },
        },
      });
      if (!product || !location)
        throw new HttpError(400, "ไม่พบ SKU หรือชั้นวางในพื้นที่ปัจจุบัน");
      if (data.productId && data.productId !== product.id)
        throw new HttpError(
          409,
          "ข้อมูล SKU เปลี่ยนหลังตรวจสินค้า กรุณาตรวจสินค้าใหม่ก่อนรับเข้า",
        );
      const unit = await convertToBase(tx, product, data.quantity, data.unitId);
      const quantity = unit.baseQuantity;
      const unitNote = `${data.quantity} ${unit.name} × ${unit.factor} = ${quantity} ${product.baseUom}`;
      if (
        product.trackSerial &&
        (data.serialNumbers.length !== quantity ||
          new Set(data.serialNumbers).size !== quantity)
      )
        throw new HttpError(
          400,
          "จำนวน Serial ต้องตรงกับจำนวนหน่วยหลักหลังแปลงและไม่ซ้ำกัน",
        );
      await requireUnlockedProducts(tx, workspaceId, [product.id]);
      if (!product.trackSerial && data.serialNumbers.length)
        throw new HttpError(
          400,
          "สินค้านี้ไม่ควบคุม Serial กรุณารับเข้าแบบจำนวน",
        );
      if (
        (product.trackLot ||
          product.issuePolicy === "FEFO" ||
          data.expiresOn) &&
        !data.lotNumber
      )
        throw new HttpError(400, "สินค้านี้ต้องระบุ Lot ก่อนรับเข้า");
      if (product.issuePolicy === "FEFO" && !data.expiresOn)
        throw new HttpError(400, "สินค้า FEFO ต้องระบุวันหมดอายุก่อนรับเข้า");
      let lotId: string | null = null;
      if (data.lotNumber) {
        const lot = await tx.stockLot.findUnique({
          where: {
            productId_number: { productId: product.id, number: data.lotNumber },
          },
        });
        if (lot && (lot.expiresOn || undefined) !== data.expiresOn)
          throw new HttpError(
            400,
            "วันหมดอายุไม่ตรงกับ Lot เดิม กรุณาตรวจสอบข้อมูล",
          );
        lotId =
          lot?.id ||
          (
            await tx.stockLot.create({
              data: {
                workspaceId,
                productId: product.id,
                number: data.lotNumber,
                expiresOn: data.expiresOn,
              },
            })
          ).id;
      }
      const layer = await tx.stockLayer.create({
        data: {
          workspaceId,
          productId: product.id,
          locationId: location.id,
          lotId,
          referenceDoc: data.referenceDoc,
          qtyOnHand: quantity,
        },
      });
      for (const serialNumber of data.serialNumbers) {
        const serial = await tx.serialItem.create({
          data: {
            workspaceId,
            productId: product.id,
            locationId: location.id,
            stockLayerId: layer.id,
            serialNumber,
            lotNumber: data.lotNumber,
            inboundDocNo: data.referenceDoc,
          },
        });
        await tx.stockLedger.create({
          data: {
            workspaceId,
            productId: product.id,
            serialItemId: serial.id,
            toLocationId: location.id,
            qtyChange: 1,
            movementType: "INBOUND_RECEIVE",
            referenceDoc: data.referenceDoc,
            performedBy: access.user.username,
            note: `Lot ${data.lotNumber || "-"} · ชุดรับเข้า ${unitNote}`,
          },
        });
      }
      if (!product.trackSerial)
        await tx.stockLedger.create({
          data: {
            workspaceId,
            productId: product.id,
            toLocationId: location.id,
            qtyChange: quantity,
            movementType: "INBOUND_RECEIVE",
            referenceDoc: data.referenceDoc,
            performedBy: access.user.username,
            note: `Lot ${data.lotNumber || "-"} · รับเข้า ${unitNote}`,
          },
        });
      const balance = await tx.inventoryBalance.upsert({
        where: {
          productId_locationId: {
            productId: product.id,
            locationId: location.id,
          },
        },
        create: {
          workspaceId,
          productId: product.id,
          locationId: location.id,
          qtyOnHand: quantity,
        },
        update: { qtyOnHand: { increment: quantity } },
      });
      return {
        layerId: layer.id,
        receivedCount: quantity,
        baseUom: product.baseUom,
        productSku: product.sku,
        locationBarcode: location.barcode,
        newQtyOnHand: balance.qtyOnHand,
      };
    },
  );
}
