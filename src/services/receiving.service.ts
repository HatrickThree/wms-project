import { ReceiptSchema } from "@/lib/validations/stock.schema";
import { HttpError, type WorkspaceAccess } from "@/lib/auth";
import { requireStockOperator } from "@/lib/warehouse-permissions";
import { stockOperation } from "./stock-operation";

export async function receiveStock(input: unknown, access: WorkspaceAccess) {
  requireStockOperator(access);
  const data = ReceiptSchema.parse(input);
  return stockOperation(access, data.operationId, { type: "receive", ...data }, async tx => {
    const workspaceId = access.workspace.id;
    const product = await tx.product.findUnique({ where: { workspaceId_sku: { workspaceId, sku: data.sku } } });
    const location = await tx.location.findUnique({ where: { workspaceId_barcode: { workspaceId, barcode: data.locationBarcode } } });
    if (!product || !location) throw new HttpError(400, "ไม่พบ SKU หรือชั้นวางในพื้นที่ปัจจุบัน");
    if (product.trackSerial && (data.serialNumbers.length !== data.quantity || new Set(data.serialNumbers).size !== data.quantity)) throw new HttpError(400, "จำนวน Serial ต้องตรงกับจำนวนรับเข้าและไม่ซ้ำกัน");
    if (!product.trackSerial && data.serialNumbers.length) throw new HttpError(400, "สินค้านี้ไม่ควบคุม Serial กรุณารับเข้าแบบจำนวน");
    if ((product.trackLot || product.issuePolicy === "FEFO" || data.expiresOn) && !data.lotNumber) throw new HttpError(400, "สินค้านี้ต้องระบุ Lot ก่อนรับเข้า");
    if (product.issuePolicy === "FEFO" && !data.expiresOn) throw new HttpError(400, "สินค้า FEFO ต้องระบุวันหมดอายุก่อนรับเข้า");
    let lotId: string | null = null;
    if (data.lotNumber) {
      const lot = await tx.stockLot.findUnique({ where: { productId_number: { productId: product.id, number: data.lotNumber } } });
      if (lot && (lot.expiresOn || undefined) !== data.expiresOn) throw new HttpError(400, "วันหมดอายุไม่ตรงกับ Lot เดิม กรุณาตรวจสอบข้อมูล");
      lotId = lot?.id || (await tx.stockLot.create({ data: { workspaceId, productId: product.id, number: data.lotNumber, expiresOn: data.expiresOn } })).id;
    }
    const layer = await tx.stockLayer.create({ data: { workspaceId, productId: product.id, locationId: location.id, lotId, referenceDoc: data.referenceDoc, qtyOnHand: data.quantity } });
    for (const serialNumber of data.serialNumbers) {
      const serial = await tx.serialItem.create({ data: { workspaceId, productId: product.id, locationId: location.id, stockLayerId: layer.id, serialNumber, lotNumber: data.lotNumber, inboundDocNo: data.referenceDoc } });
      await tx.stockLedger.create({ data: { workspaceId, productId: product.id, serialItemId: serial.id, toLocationId: location.id, qtyChange: 1, movementType: "INBOUND_RECEIVE", referenceDoc: data.referenceDoc, performedBy: access.user.username, note: `Lot ${data.lotNumber || "-"} · รับเข้า` } });
    }
    if (!product.trackSerial) await tx.stockLedger.create({ data: { workspaceId, productId: product.id, toLocationId: location.id, qtyChange: data.quantity, movementType: "INBOUND_RECEIVE", referenceDoc: data.referenceDoc, performedBy: access.user.username, note: `Lot ${data.lotNumber || "-"} · รับเข้าแบบจำนวน` } });
    const balance = await tx.inventoryBalance.upsert({ where: { productId_locationId: { productId: product.id, locationId: location.id } }, create: { workspaceId, productId: product.id, locationId: location.id, qtyOnHand: data.quantity }, update: { qtyOnHand: { increment: data.quantity } } });
    return { layerId: layer.id, receivedCount: data.quantity, productSku: product.sku, locationBarcode: location.barcode, newQtyOnHand: balance.qtyOnHand };
  });
}
