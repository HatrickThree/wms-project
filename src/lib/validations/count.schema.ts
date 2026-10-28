import { z } from "zod";
import { BusinessDateSchema, OperationKeySchema } from "./stock.schema";
export const StartCountSchema = z.object({
  operationId: OperationKeySchema,
  productId: z.string().min(1),
  number: z.string().trim().min(3).max(100),
  mode: z.enum(["SNAPSHOT", "LOCK"]),
});
export const CountActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("entry"),
    operationId: OperationKeySchema,
    locationBarcode: z.string().trim().min(1).max(100),
    lotNumber: z.string().trim().max(100).default(""),
    expiresOn: BusinessDateSchema.optional(),
    quantity: z.number().int().min(0).max(1_000_000),
    unitId: z.string().min(1).optional(),
    serialNumbers: z
      .array(z.string().trim().min(3).max(256))
      .max(10_000)
      .default([]),
  }),
  z.object({
    action: z.literal("submit"),
    operationId: OperationKeySchema,
    confirmComplete: z.literal(true),
  }),
  z.object({
    action: z.literal("approve"),
    operationId: OperationKeySchema,
    reason: z
      .string()
      .trim()
      .min(5, "กรุณาระบุเหตุผลอนุมัติอย่างน้อย 5 ตัวอักษร")
      .max(1000),
  }),
  z.object({
    action: z.literal("cancel"),
    operationId: OperationKeySchema,
    reason: z.string().trim().min(5).max(1000),
  }),
]);
