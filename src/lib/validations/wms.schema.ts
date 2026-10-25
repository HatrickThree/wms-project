import { z } from "zod";

export const InboundReceiveSchema = z.object({
  referenceDoc: z.string().min(3, "กรุณาระบุเลขที่เอกสารรับเข้า เช่น GRN-202610-001"),
  locationBarcode: z.string().min(2, "กรุณาสแกนบาร์โค้ดชั้นวาง"),
  sku: z.string().min(2, "กรุณาสแกนรหัสสินค้า (SKU)"),
  serialNumbers: z
    .array(z.string().trim().min(3, "Serial Number ต้องมีอย่างน้อย 3 ตัวอักษร"))
    .min(1, "กรุณาสแกน Serial Number อย่างน้อย 1 รายการ"),
  lotNumber: z.string().optional(),
  performedBy: z.string().default("WH-STAFF-01"),
});

export const OutboundPickSchema = z.object({
  outboundDocNo: z.string().min(3, "กรุณาระบุเลขที่ใบสั่งขาย/ใบเบิก เช่น SO-202610-001"),
  locationBarcode: z.string().min(2, "กรุณาสแกนบาร์โค้ดชั้นวางที่หยิบ"),
  serialNumber: z.string().min(3, "กรุณาสแกนหมายเลข Serial Number ที่หยิบ"),
  performedBy: z.string().default("WH-PICKER-01"),
});

export const TransferSerialSchema = z.object({
  serialNumber: z.string().min(3, "กรุณาสแกน Serial Number"),
  toLocationBarcode: z.string().min(2, "กรุณาสแกนบาร์โค้ดชั้นวางปลายทาง"),
  referenceDoc: z.string().default("TF-INTERNAL"),
  performedBy: z.string().default("WH-STAFF-01"),
});
