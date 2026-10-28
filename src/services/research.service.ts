import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  HttpError,
  type WorkspaceAccess,
  workspaceVisibility,
} from "@/lib/auth";
import {
  FormConfigSchema,
  type FormConfig,
  formKinds,
  csvText,
} from "@/lib/research";
import { OperationKeySchema } from "@/lib/validations/stock.schema";
import { requireInstructor } from "./training.service";
import { stockOperation } from "./stock-operation";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function scopes(a: WorkspaceAccess) {
  const ids = [a.workspace.id];
  const round = await prisma.trainingRound.findUnique({
    where: { workspaceId: a.workspace.id },
    include: { lesson: { select: { workspaceId: true } } },
  });
  if (round) {
    const parent = await prisma.workspace.findFirst({
      where: {
        AND: [
          { id: round.lesson.workspaceId },
          await workspaceVisibility(a.user),
        ],
      },
    });
    if (parent) ids.push(parent.id);
  }
  return ids;
}
const teacher = (a: WorkspaceAccess) =>
  a.workspace.type === "TRAINING" &&
  ["ADMIN", "INSTRUCTOR"].includes(a.user.role);
function publicConfig(text: string) {
  const c = FormConfigSchema.parse(JSON.parse(text));
  return { ...c, questions: c.questions.map(({ correctOption, ...q }) => q) };
}
function quizScore(config: FormConfig, answers: Record<string, unknown>) {
  const questions = config.questions.filter(
    (q) => q.type === "CHOICE" && q.correctOption !== null,
  );
  return questions.length
    ? {
        correct: questions.filter((q) => answers[q.id] === q.correctOption)
          .length,
        total: questions.length,
      }
    : null;
}
export async function researchData(a: WorkspaceAccess) {
  if (a.workspace.type !== "TRAINING")
    return { teacher: false, isTraining: false, forms: [] };
  const isTeacher = teacher(a),
    ids = await scopes(a);
  const forms = await prisma.researchForm.findMany({
    where: {
      workspaceId: { in: ids },
      ...(!isTeacher
        ? { status: "APPROVED", kind: { in: ["PRE", "POST", "SATISFACTION"] } }
        : {}),
    },
    include: {
      responses: { ...(isTeacher ? {} : { where: { userId: a.user.id } }) },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    teacher: isTeacher,
    isTraining: true,
    forms: forms.map((f) => ({
      id: f.id,
      title: f.title,
      kind: f.kind,
      status: f.status,
      workspaceId: f.workspaceId,
      canEdit: isTeacher && f.workspaceId === a.workspace.id,
      approvedBy: f.approvedBy,
      approvedAt: f.approvedAt,
      configHash: isTeacher
        ? hash({
            title: f.title,
            kind: f.kind,
            config: JSON.parse(f.configJson),
          })
        : undefined,
      config: isTeacher ? JSON.parse(f.configJson) : publicConfig(f.configJson),
      responded: f.responses.some((r) => r.userId === a.user.id),
      responseCount: isTeacher ? f.responses.length : undefined,
      ...(isTeacher
        ? {
            responses: f.responses.map((r) => ({
              id: r.id,
              respondentCode: r.respondentCode,
              submittedAt: r.submittedAt,
              answers: JSON.parse(r.answersJson),
              score: quizScore(
                FormConfigSchema.parse(JSON.parse(f.configJson)),
                JSON.parse(r.answersJson),
              ),
            })),
          }
        : {}),
    })),
  };
}
export async function saveForm(raw: unknown, a: WorkspaceAccess) {
  requireInstructor(a);
  const i = z
    .object({
      operationId: OperationKeySchema,
      id: z.string().optional(),
      title: z
        .string()
        .trim()
        .min(3, "กรอกชื่อเครื่องมืออย่างน้อย 3 ตัวอักษร")
        .max(200),
      kind: z.enum(["PRE", "POST", "EXPERT", "SATISFACTION"]),
      config: FormConfigSchema,
    })
    .parse(raw);
  if (
    !["PRE", "POST"].includes(i.kind) &&
    i.config.questions.some((q) => q.correctOption !== null)
  )
    throw new HttpError(400, "เฉลยใช้กับแบบทดสอบก่อน–หลังเท่านั้น");
  return stockOperation(
    a,
    i.operationId,
    { type: "research.save", ...i },
    async (tx) => {
      const fields = {
        title: i.title,
        kind: i.kind,
        configJson: JSON.stringify(i.config),
      };
      if (i.id) {
        const f = await tx.researchForm.findFirst({
          where: { id: i.id, workspaceId: a.workspace.id, status: "DRAFT" },
        });
        if (!f) throw new HttpError(409, "แก้ไขได้เฉพาะร่างในพื้นที่นี้");
        await tx.researchForm.update({ where: { id: f.id }, data: fields });
        return {
          id: f.id,
          message: "บันทึกร่างเครื่องมือแล้ว ยังไม่เปิดเก็บคำตอบ",
        };
      }
      const f = await tx.researchForm.create({
        data: {
          ...fields,
          workspaceId: a.workspace.id,
          createdBy: a.user.username,
        },
      });
      return {
        id: f.id,
        message: "สร้างร่างเครื่องมือแล้ว ผู้สอนต้องตรวจและอนุมัติก่อนใช้",
      };
    },
  );
}
export async function approveForm(raw: unknown, a: WorkspaceAccess) {
  requireInstructor(a);
  const i = z
    .object({
      operationId: OperationKeySchema,
      formId: z.string().min(1),
      expectedConfigHash: z.string().length(64),
      acknowledge: z.literal(true),
    })
    .parse(raw);
  return stockOperation(
    a,
    i.operationId,
    { type: "research.approve", ...i },
    async (tx) => {
      const f = await tx.researchForm.findFirst({
        where: { id: i.formId, workspaceId: a.workspace.id, status: "DRAFT" },
      });
      if (!f) throw new HttpError(409, "ไม่พบร่างเครื่องมือในพื้นที่นี้");
      if (
        hash({
          title: f.title,
          kind: f.kind,
          config: JSON.parse(f.configJson),
        }) !== i.expectedConfigHash
      )
        throw new HttpError(
          409,
          "คำถามเปลี่ยนไปแล้ว โหลดและตรวจใหม่ก่อนอนุมัติ",
        );
      const config = FormConfigSchema.parse(JSON.parse(f.configJson));
      if (
        ["PRE", "POST"].includes(f.kind) &&
        config.questions.some(
          (q) => q.type === "CHOICE" && q.correctOption === null,
        )
      )
        throw new HttpError(
          400,
          "แบบทดสอบต้องระบุเฉลยสำหรับคำถามตัวเลือกทุกข้อก่อนเปิดใช้",
        );
      await tx.researchForm.update({
        where: { id: f.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: a.user.username,
        },
      });
      return {
        message:
          "อนุมัติเครื่องมือรุ่นนี้แล้ว คำถามและเฉลยจะไม่ถูกแก้หลังเก็บคำตอบ",
      };
    },
  );
}
export async function answerForm(raw: unknown, a: WorkspaceAccess) {
  const i = z
    .object({
      formId: z.string().min(1),
      answers: z.record(z.union([z.number().finite(), z.string().max(5000)])),
    })
    .parse(raw);
  const ids = await scopes(a);
  const f = await prisma.researchForm.findFirst({
    where: { id: i.formId, workspaceId: { in: ids }, status: "APPROVED" },
  });
  if (!f)
    throw new HttpError(
      404,
      "ไม่พบเครื่องมือที่อนุมัติแล้วในพื้นที่ที่เข้าถึงได้",
    );
  if (
    (f.kind === "EXPERT" && !teacher(a)) ||
    (f.kind !== "EXPERT" && a.user.role !== "STUDENT")
  )
    throw new HttpError(
      403,
      "แบบประเมินนี้กำหนดผู้ตอบตามบทบาท ผู้เชี่ยวชาญใช้บัญชีผู้สอนที่ได้รับเชิญในพื้นที่ฝึก",
    );
  const c = FormConfigSchema.parse(JSON.parse(f.configJson));
  if (
    Object.keys(i.answers).some((id) => !c.questions.some((q) => q.id === id))
  )
    throw new HttpError(400, "มีคำตอบที่ไม่ตรงกับคำถามของเครื่องมือนี้");
  const normalized: Record<string, string | number> = {};
  for (const q of c.questions) {
    const v = i.answers[q.id];
    if (v === undefined || v === "") {
      if (q.required) throw new HttpError(400, "กรอกคำถามจำเป็นให้ครบ");
      continue;
    }
    if (q.type === "TEXT") {
      if (typeof v !== "string" || !v.trim())
        throw new HttpError(400, "คำตอบข้อความไม่ถูกต้อง");
      normalized[q.id] = v.trim();
    } else if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      (q.type === "CHOICE"
        ? v < 0 || v >= q.options.length
        : v < q.min || v > q.max)
    )
      throw new HttpError(400, "คำตอบตัวเลือกหรือมาตราส่วนอยู่นอกช่วง");
    else normalized[q.id] = v;
  }
  const existing = await prisma.researchResponse.findUnique({
    where: { formId_userId: { formId: f.id, userId: a.user.id } },
  });
  if (existing) {
    if (hash(JSON.parse(existing.answersJson)) !== hash(normalized))
      throw new HttpError(
        409,
        "ส่งคำตอบเครื่องมือรุ่นนี้ไปแล้ว แก้ทับคำตอบเดิมไม่ได้",
      );
    return { message: "ส่งคำตอบชุดนี้แล้ว ไม่บันทึกซ้ำ" };
  }
  const respondentCode = createHash("sha256")
    .update(`${f.workspaceId}:${a.user.id}`)
    .digest("hex")
    .slice(0, 16);
  try {
    await prisma.researchResponse.create({
      data: {
        formId: f.id,
        userId: a.user.id,
        respondentCode,
        answersJson: JSON.stringify(normalized),
      },
    });
  } catch (e) {
    const completed = await prisma.researchResponse.findUnique({
      where: { formId_userId: { formId: f.id, userId: a.user.id } },
    });
    if (
      !completed ||
      hash(JSON.parse(completed.answersJson)) !== hash(normalized)
    )
      throw e;
  }
  return {
    message:
      "ส่งคำตอบแล้ว ผู้สอนใช้ผลตามเครื่องมือที่อนุมัติ ไม่รวมเป็นคะแนนสมรรถนะอัตโนมัติ",
  };
}
export async function exportResearch(a: WorkspaceAccess) {
  requireInstructor(a);
  const data = await researchData(a);
  const rows: unknown[][] = [
    [
      "form_id",
      "title",
      "kind",
      "instrument_code",
      "version",
      "respondent_code",
      "submitted_at",
      "question_id",
      "question",
      "answer",
      "correct_choices",
      "scored_choices",
    ],
  ];
  for (const f of data.forms) {
    const c = f.config as FormConfig;
    for (const r of f.responses || [])
      for (const q of c.questions) {
        const value = r.answers[q.id];
        rows.push([
          f.id,
          f.title,
          formKinds[f.kind as keyof typeof formKinds],
          c.instrumentCode,
          c.version,
          r.respondentCode,
          r.submittedAt.toISOString(),
          q.id,
          q.text,
          q.type === "CHOICE" && typeof value === "number"
            ? q.options[value]
            : value,
          r.score?.correct,
          r.score?.total,
        ]);
      }
  }
  return csvText(rows);
}
