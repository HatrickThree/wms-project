import { z } from "zod";
export const tpqiUnits = [
  {
    code: "LOG-JIVK-770A",
    book: "51001",
    name: "ปฏิบัติงานคลังสินค้าตามที่ได้รับมอบหมาย",
  },
  { code: "LOG-JEQR-771A", book: "51002", name: "ปฏิบัติตามขั้นตอนการทำงาน" },
  {
    code: "LOG-MVIX-772A",
    book: "51003",
    name: "อาชีวอนามัย ความปลอดภัย และสิ่งแวดล้อม",
  },
  { code: "LOG-JKLT-774A", book: "51005", name: "รับสินค้า" },
  { code: "LOG-UIMV-775A", book: "51006", name: "ตรวจสอบก่อนจัดเก็บ" },
  { code: "LOG-BASK-777A", book: "51008", name: "จัดเก็บและจัดวางสินค้า" },
  { code: "LOG-EYPL-778A", book: "51009", name: "จำแนกและดูแลสินค้า" },
  { code: "LOG-CSMT-779A", book: "51010", name: "หยิบสินค้า" },
  { code: "LOG-XDIF-780A", book: "51011", name: "บรรจุสินค้า" },
] as const;
export const taskLabels = {
  RECEIVE: "รับสินค้า",
  PUTAWAY: "จัดเก็บ / ย้าย",
  PICK: "จอง หยิบ และจ่าย",
  COUNT: "ตรวจนับ",
} as const;
export const scenarioLabels = {
  NORMAL: "สถานการณ์ปกติ",
  SHORTAGE: "สินค้าขาดจากชั้นจำลอง",
  EXCESS: "สินค้าเกินจากชั้นจำลอง",
  URGENT: "คำสั่งเบิกเร่งด่วน",
} as const;
export const criterionSchema = z.object({
  id: z.string().min(1).max(100),
  unitCode: z
    .string()
    .refine(
      (v) => tpqiUnits.some((u) => u.code === v),
      "เลือกหน่วยสมรรถนะ TPQI ที่อ้างอิง",
    ),
  description: z
    .string()
    .trim()
    .min(3, "กรอกเกณฑ์ประเมินอย่างน้อย 3 ตัวอักษร")
    .max(1000),
  method: z.enum(["SYSTEM", "OBSERVATION", "WRITTEN", "INTERVIEW"]),
  required: z.boolean(),
});
export const LessonConfigSchema = z
  .object({
    task: z.enum(["RECEIVE", "PUTAWAY", "PICK", "COUNT"]),
    scenario: z.enum(["NORMAL", "SHORTAGE", "EXCESS", "URGENT"]),
    instructions: z
      .string()
      .trim()
      .min(5, "กรอกคำสั่งงานอย่างน้อย 5 ตัวอักษร")
      .max(5000),
    mode: z.enum(["INDIVIDUAL", "TEAM"]),
    seed: z
      .string()
      .trim()
      .min(1, "ระบุรหัสสุ่ม Seed ก่อนบันทึกโจทย์")
      .max(100),
    sameSeed: z.boolean(),
    groups: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          userIds: z.array(z.string().min(1)).min(1).max(30),
        }),
      )
      .min(1, "เลือกผู้เรียนอย่างน้อยหนึ่งคน")
      .max(30),
    criteria: z
      .array(criterionSchema)
      .min(1, "เพิ่มเกณฑ์สมรรถนะอย่างน้อยหนึ่งข้อ")
      .max(50),
  })
  .superRefine((v, ctx) => {
    const users = v.groups.flatMap((g) => g.userIds);
    if (new Set(users).size !== users.length)
      ctx.addIssue({
        code: "custom",
        message: "ผู้เรียนหนึ่งคนต้องอยู่กลุ่มเดียวในโจทย์นี้",
      });
    if (v.mode === "INDIVIDUAL" && v.groups.some((g) => g.userIds.length !== 1))
      ctx.addIssue({
        code: "custom",
        message: "แบบแยกคนต้องมีผู้เรียนหนึ่งคนต่อคลัง",
      });
    if (["SHORTAGE", "EXCESS"].includes(v.scenario) && v.task !== "COUNT")
      ctx.addIssue({
        code: "custom",
        message: "สถานการณ์ขาด/เกินใช้กับงานตรวจนับชั้นจำลอง",
      });
    if (v.scenario === "URGENT" && v.task !== "PICK")
      ctx.addIssue({
        code: "custom",
        message: "สถานการณ์เร่งด่วนใช้กับงานหยิบ",
      });
    if (new Set(v.criteria.map((c) => c.id)).size !== v.criteria.length)
      ctx.addIssue({ code: "custom", message: "รหัสเกณฑ์ต้องไม่ซ้ำ" });
  });
export type LessonConfig = z.infer<typeof LessonConfigSchema>;
export interface PhysicalShelf {
  locationId: string;
  locationBarcode: string;
  sku: string;
  productId: string;
  lotNumber: string;
  expiresOn: string | null;
  quantity: number;
  serials: string[];
}
export function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function simulateShelves(
  source: PhysicalShelf[],
  scenario: LessonConfig["scenario"],
  seed: string,
) {
  const rows = structuredClone(source).sort(
    (a, b) =>
      a.sku.localeCompare(b.sku, "en") ||
      a.locationBarcode.localeCompare(b.locationBarcode, "en") ||
      a.lotNumber.localeCompare(b.lotNumber, "en"),
  );
  const random = seededRandom(`SHELF_V1:${seed}`);
  const eligible = rows.filter((r) => r.quantity > 0);
  if (["SHORTAGE", "EXCESS"].includes(scenario)) {
    if (!eligible.length)
      throw new Error("สถานการณ์ขาด/เกินต้องมีสต็อกตั้งต้น");
    const row = eligible[Math.floor(random() * eligible.length)];
    if (scenario === "SHORTAGE") {
      if (row.serials.length) {
        row.serials.splice(Math.floor(random() * row.serials.length), 1);
        row.quantity--;
      } else
        row.quantity -= Math.min(row.quantity, 1 + Math.floor(random() * 3));
    } else {
      if (row.serials.length) {
        const suffix = Math.floor(random() * 0xffffffff).toString(16);
        row.serials.push(`SIM-${row.sku}-${suffix}`);
        row.quantity++;
      } else row.quantity += 1 + Math.floor(random() * 3);
    }
  }
  return rows;
}
export const operationTasks: Record<string, string[]> = {
  RECEIVE: ["receive"],
  PUTAWAY: ["transfer"],
  PICK: ["create-order", "order-action", "map.route"],
  COUNT: ["count-start", "count-entry", "count-submit", "count-cancel"],
};
