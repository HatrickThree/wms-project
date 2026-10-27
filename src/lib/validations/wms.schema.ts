import { z } from "zod";

const SearchDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "วันที่ไม่ถูกต้อง");

export const InventorySearchSchema = z
  .object({
    keyword: z.string().max(200).optional(),
    category: z.string().max(100).optional(),
    zone: z.string().max(100).optional(),
    locationBarcode: z.string().max(100).optional(),
    status: z
      .enum([
        "ALL",
        "IN_STOCK",
        "ALLOCATED",
        "SHIPPED",
        "RETURNED",
        "DEFECTIVE",
      ])
      .optional(),
    docNo: z.string().max(200).optional(),
    lotNumber: z.string().max(200).optional(),
    dateFrom: SearchDateSchema.optional(),
    dateTo: SearchDateSchema.optional(),
  })
  .refine(
    (value) =>
      !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
    {
      message: "วันที่สิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น",
      path: ["dateTo"],
    },
  );

export const InboundReceiveSchema = z.object({
  referenceDoc: z
    .string()
    .min(3, "กรุณาระบุเลขที่เอกสารรับเข้า เช่น GRN-202610-001"),
  locationBarcode: z.string().min(2, "กรุณาสแกนบาร์โค้ดชั้นวาง"),
  sku: z.string().min(2, "กรุณาสแกนรหัสสินค้า (SKU)"),
  serialNumbers: z
    .array(z.string().trim().min(3, "Serial Number ต้องมีอย่างน้อย 3 ตัวอักษร"))
    .min(1, "กรุณาสแกน Serial Number อย่างน้อย 1 รายการ"),
  lotNumber: z.string().optional(),
  performedBy: z.string().default("WH-STAFF-01"),
});

export const OutboundPickSchema = z.object({
  outboundDocNo: z
    .string()
    .min(3, "กรุณาระบุเลขที่ใบสั่งขาย/ใบเบิก เช่น SO-202610-001"),
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
