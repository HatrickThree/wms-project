import { z } from "zod";
const code = z.string().trim().min(1).max(100);
export const BusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "วันที่ไม่ถูกต้อง");
export const QuantitySchema = z.number().int("จำนวนต้องเป็นจำนวนเต็มตามหน่วยหลัก").positive().max(1_000_000);
export const OperationKeySchema = z.string().uuid("กรุณารีเฟรชเพื่อสร้างรหัสรายการใหม่");
export const ProductSchema = z.object({
  sku: code, barcode: code, name: z.string().trim().min(2).max(200), category: z.string().trim().max(100).default(""),
  baseUom: z.string().trim().min(1).max(20), minStock: z.number().int().min(0).max(1_000_000),
  trackSerial: z.boolean(), trackLot: z.boolean(), issuePolicy: z.enum(["FIFO", "FEFO"]),
});
export const WarehouseSchema = z.object({ code, name: z.string().trim().min(2).max(100) });
export const LocationSchema = z.object({ warehouseId: code, barcode: code, zone: code, aisle: code, rack: code, level: code, type: z.enum(["RECEIVING", "STORAGE", "PICKING", "PACKING", "QUARANTINE"]) });
export const ReceiptSchema = z.object({
  operationId: OperationKeySchema, referenceDoc: code, sku: code, locationBarcode: code,
  quantity: QuantitySchema, serialNumbers: z.array(z.string().trim().min(3).max(256)).max(500).default([]),
  lotNumber: z.string().trim().max(100).optional(), expiresOn: BusinessDateSchema.optional(),
});
export const CreateOrderSchema = z.object({ operationId: OperationKeySchema, number: code, lines: z.array(z.object({ productId: code, quantity: QuantitySchema })).min(1).max(100) });
export const OrderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reserve"), operationId: OperationKeySchema, preferredLayers: z.array(code).max(500).default([]), reason: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("pick"), operationId: OperationKeySchema, allocationId: code, locationBarcode: code, serialNumber: z.string().max(256).optional(), quantity: QuantitySchema }),
  z.object({ action: z.literal("ship"), operationId: OperationKeySchema }),
  z.object({ action: z.literal("cancel"), operationId: OperationKeySchema }),
]);
