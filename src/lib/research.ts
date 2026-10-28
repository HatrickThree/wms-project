import { z } from "zod";
export const formKinds = {
  PRE: "แบบทดสอบก่อนเรียน",
  POST: "แบบทดสอบหลังเรียน",
  EXPERT: "แบบประเมินผู้เชี่ยวชาญ",
  SATISFACTION: "แบบความพึงพอใจ",
} as const;
export const QuestionSchema = z
  .object({
    id: z.string().min(1).max(100),
    text: z
      .string()
      .trim()
      .min(3, "กรอกข้อความคำถามอย่างน้อย 3 ตัวอักษร")
      .max(2000),
    type: z.enum(["CHOICE", "SCALE", "TEXT"]),
    required: z.boolean(),
    options: z.array(z.string().trim().max(300)).max(8),
    correctOption: z.number().int().min(0).max(7).nullable(),
    min: z.number().int().min(0).max(10),
    max: z.number().int().min(1).max(10),
  })
  .superRefine((q, c) => {
    if (
      q.type === "CHOICE" &&
      (q.options.length < 2 ||
        q.options.some((option) => !option) ||
        new Set(q.options).size !== q.options.length ||
        (q.correctOption !== null && q.correctOption >= q.options.length))
    )
      c.addIssue({
        code: "custom",
        message:
          "ตัวเลือกต้องมีอย่างน้อยสองข้อ ไม่ซ้ำ และเฉลยต้องเป็นตัวเลือกที่มีอยู่",
      });
    if (q.type === "SCALE" && q.min >= q.max)
      c.addIssue({
        code: "custom",
        message: "ค่าต่ำสุดของมาตราส่วนต้องน้อยกว่าค่าสูงสุด",
      });
  })
  .transform((q) =>
    q.type === "CHOICE" ? q : { ...q, options: [], correctOption: null },
  );
export const FormConfigSchema = z
  .object({
    instrumentCode: z.string().trim().max(100),
    version: z.string().trim().min(1, "ระบุรุ่นเครื่องมือ").max(50),
    instructions: z.string().trim().max(5000),
    questions: z
      .array(QuestionSchema)
      .min(1, "เพิ่มคำถามอย่างน้อยหนึ่งข้อก่อนบันทึก")
      .max(100),
  })
  .superRefine((v, c) => {
    if (new Set(v.questions.map((q) => q.id)).size !== v.questions.length)
      c.addIssue({ code: "custom", message: "รหัสคำถามต้องไม่ซ้ำ" });
  });
export type FormConfig = z.infer<typeof FormConfigSchema>;
export function csvText(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let v = value === null || value === undefined ? "" : String(value);
            if (/^[\s]*[=+@\-\t\r]/.test(v)) v = "'" + v;
            return '"' + v.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
