import { z } from "zod";
import { BusinessDateSchema, OperationKeySchema } from "./stock.schema";
export const ABCTieRuleSchema = z.enum(["SKU_ORDER", "KEEP_FREQUENCY_GROUP"]);
export const ABCSettingsSchema = z
  .object({
    operationId: OperationKeySchema,
    windowDays: z.number().int().min(1).max(3650),
    thresholdA: z.number().int().min(1).max(99),
    thresholdB: z.number().int().min(1).max(99),
    tieRule: ABCTieRuleSchema,
    daysA: z.number().int().min(1).max(3650).nullable(),
    daysB: z.number().int().min(1).max(3650).nullable(),
    daysC: z.number().int().min(1).max(3650).nullable(),
  })
  .refine((x) => x.thresholdA < x.thresholdB, "เส้นแบ่ง A ต้องน้อยกว่า B");
export const ABCAnalyzeSchema = z
  .object({
    operationId: OperationKeySchema,
    fromDate: BusinessDateSchema,
    toDate: BusinessDateSchema,
  })
  .refine(
    (x) => x.fromDate <= x.toDate,
    "วันที่สิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น",
  );
export const ABCConfirmSchema = z.object({
  operationId: OperationKeySchema,
  runId: z.string().min(1),
  changes: z
    .array(
      z.object({
        productId: z.string().min(1),
        class: z.enum(["A", "B", "C"]),
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(500),
});
