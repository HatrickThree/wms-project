"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, Feedback, LoadingState, EmptyState } from "./common";
import { useWarehouseCommand, CommandFeedback } from "./use-warehouse-command";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { request } from "@/lib/wms";
import { FormConfigSchema, formKinds, type FormConfig } from "@/lib/research";
type Question = FormConfig["questions"][number];
interface Form {
  id: string;
  title: string;
  kind: keyof typeof formKinds;
  status: string;
  canEdit: boolean;
  approvedBy: string | null;
  configHash?: string;
  config: FormConfig;
  responded: boolean;
  responseCount?: number;
  responses?: {
    id: string;
    respondentCode: string;
    submittedAt: string;
    answers: Record<string, string | number>;
    score: { correct: number; total: number } | null;
  }[];
}
interface Data {
  teacher: boolean;
  isTraining: boolean;
  forms: Form[];
}
const selectClass = "h-12 w-full rounded-lg border bg-background px-3 text-sm";
const empty = (): FormConfig => ({
  instrumentCode: "",
  version: "1",
  instructions: "",
  questions: [],
});
export function ResearchScreen() {
  const [data, setData] = useState<Data | null>(null),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(false),
    [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<keyof typeof formKinds>("PRE"),
    [draft, setDraft] = useState<FormConfig>(empty);
  const [approve, setApprove] = useState<Form | null>(null),
    [ack, setAck] = useState(false);
  const [answering, setAnswering] = useState<Form | null>(null),
    [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [report, setReport] = useState("");
  const command = useWarehouseCommand();
  useUnsavedChanges(editing || !!answering || command.uncertain);
  const reload = () => setRefresh((n) => n + 1);
  useEffect(() => {
    let active = true;
    request<Data>("/api/research")
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const open = (f?: Form) => {
    setId(f?.id || "");
    setTitle(f?.title || "");
    setKind(f?.kind || "PRE");
    setDraft(f ? structuredClone(f.config) : empty());
    setEditing(true);
    command.setFeedback(null);
  };
  const patch = (id: string, p: Partial<Question>) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q) => (q.id === id ? { ...q, ...p } : q)),
    }));
  const save = () => {
    const p = FormConfigSchema.safeParse(draft);
    if (!p.success) {
      setError(p.error.issues[0].message);
      return;
    }
    setError("");
    void command.send(
      "/api/research",
      { action: "save", ...(id ? { id } : {}), title, kind, config: p.data },
      () => {
        setEditing(false);
        reload();
      },
    );
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="RESEARCH / INSTRUMENTS"
        title="แบบทดสอบและแบบวิจัย"
        description="สร้างร่างเครื่องมือ ตรวจและอนุมัติเป็นรุ่นก่อนเก็บคำตอบ แบบทดสอบความรู้แยกจากผลสมรรถนะของผู้สอน"
        action={
          <Link href="/training">
            <Button variant="outline">ห้องเรียน / รอบฝึก</Button>
          </Link>
        }
      />
      <CommandFeedback command={command} />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {!data ? (
        <LoadingState />
      ) : !data.isTraining ? (
        <EmptyState
          title="เครื่องมืออยู่ในพื้นที่ฝึก"
          description="เลือกพื้นที่ฝึกเพื่อจัดการแบบทดสอบหรือแบบประเมิน"
          action={
            <Link href="/workspaces">
              <Button>เลือกพื้นที่</Button>
            </Link>
          }
        />
      ) : (
        <>
          {data.teacher && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={editing} onClick={() => open()}>
                <Plus />
                สร้างร่างเครื่องมือ
              </Button>
              <a href="/api/research/export" download>
                <Button variant="outline">
                  <FileDown />
                  ดาวน์โหลดคำตอบ CSV
                </Button>
              </a>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            คำถามที่สร้างเป็นเครื่องมือของผู้สอน
            การอนุมัติในระบบไม่ใช่การรับรองความเที่ยงหรือความตรงของเครื่องมือวิจัย
            คำตอบที่ส่งแล้วและเครื่องมือที่อนุมัติแล้วแก้ทับไม่ได้
            หากปรับคำถามให้สร้างรุ่นใหม่
            การส่งออกใช้รหัสผู้ตอบสำหรับจับคู่ก่อน–หลัง
            ไม่ถือว่าเป็นข้อมูลนิรนาม
          </p>
          {editing && (
            <Card>
              <CardHeader>
                <CardTitle>ร่างเครื่องมือ · ยังไม่เปิดเก็บคำตอบ</CardTitle>
              </CardHeader>
              <CardContent>
                <fieldset disabled={command.disabled} className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="field-group">
                      <Label htmlFor="research-title">ชื่อเครื่องมือ</Label>
                      <Input
                        id="research-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </div>
                    <div className="field-group">
                      <Label htmlFor="research-kind">ประเภท</Label>
                      <select
                        disabled={command.disabled}
                        id="research-kind"
                        className={selectClass}
                        value={kind}
                        onChange={(e) => {
                          const k = e.target.value as typeof kind;
                          setKind(k);
                          if (!["PRE", "POST"].includes(k))
                            setDraft((d) => ({
                              ...d,
                              questions: d.questions.map((q) => ({
                                ...q,
                                correctOption: null,
                              })),
                            }));
                        }}
                      >
                        {Object.entries(formKinds).map(([k, v]) => (
                          <option value={k} key={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <Label htmlFor="research-code">
                        รหัสชุดเครื่องมือ / ชุดก่อน–หลัง
                      </Label>
                      <Input
                        id="research-code"
                        value={draft.instrumentCode}
                        onChange={(e) =>
                          setDraft({ ...draft, instrumentCode: e.target.value })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <Label htmlFor="research-version">รุ่นเครื่องมือ</Label>
                      <Input
                        id="research-version"
                        value={draft.version}
                        onChange={(e) =>
                          setDraft({ ...draft, version: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="field-group">
                    <Label htmlFor="research-instructions">
                      คำชี้แจงผู้ตอบ
                    </Label>
                    <textarea
                      disabled={command.disabled}
                      id="research-instructions"
                      className="min-h-24 rounded-lg border p-3 text-sm"
                      value={draft.instructions}
                      onChange={(e) =>
                        setDraft({ ...draft, instructions: e.target.value })
                      }
                    />
                  </div>
                  {draft.questions.map((q, index) => (
                    <div className="space-y-3 rounded-xl border p-4" key={q.id}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium">ข้อ {index + 1}</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`ลบคำถาม ${index + 1}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              questions: draft.questions.filter(
                                (x) => x.id !== q.id,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <Label htmlFor={`question-${q.id}`}>ข้อความคำถาม</Label>
                      <textarea
                        disabled={command.disabled}
                        id={`question-${q.id}`}
                        className="min-h-24 w-full rounded-lg border p-3 text-sm"
                        value={q.text}
                        onChange={(e) => patch(q.id, { text: e.target.value })}
                      />
                      <select
                        disabled={command.disabled}
                        aria-label={`ชนิดคำตอบข้อ ${index + 1}`}
                        className={selectClass}
                        value={q.type}
                        onChange={(e) =>
                          patch(q.id, {
                            type: e.target.value as Question["type"],
                            options:
                              e.target.value === "CHOICE"
                                ? q.options.length >= 2
                                  ? q.options
                                  : ["", ""]
                                : [],
                            correctOption: null,
                          })
                        }
                      >
                        <option value="CHOICE">เลือกหนึ่งตัวเลือก</option>
                        <option value="SCALE">มาตราส่วนจำนวนเต็ม</option>
                        <option value="TEXT">ข้อความ</option>
                      </select>
                      {q.type === "CHOICE" && (
                        <>
                          <Label htmlFor={`options-${q.id}`}>
                            ตัวเลือก (หนึ่งบรรทัดต่อหนึ่งตัวเลือก)
                          </Label>
                          <textarea
                            disabled={command.disabled}
                            id={`options-${q.id}`}
                            className="min-h-24 w-full rounded-lg border p-3 text-sm"
                            value={q.options.join("\n")}
                            onChange={(e) =>
                              patch(q.id, {
                                options: e.target.value.split("\n"),
                                correctOption: null,
                              })
                            }
                          />
                          {["PRE", "POST"].includes(kind) && (
                            <div className="field-group">
                              <Label htmlFor={`correct-${q.id}`}>
                                เฉลยสำหรับผู้สอน
                              </Label>
                              <select
                                disabled={command.disabled}
                                id={`correct-${q.id}`}
                                className={selectClass}
                                value={q.correctOption ?? ""}
                                onChange={(e) =>
                                  patch(q.id, {
                                    correctOption:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  })
                                }
                              >
                                <option value="">ยังไม่ระบุเฉลย</option>
                                {q.options.map((o, i) => (
                                  <option key={i} value={i}>
                                    {i + 1}. {o}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                      {q.type === "SCALE" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="field-group">
                            <Label htmlFor={`min-${q.id}`}>ค่าต่ำสุด</Label>
                            <Input
                              id={`min-${q.id}`}
                              type="number"
                              min="0"
                              max="10"
                              value={q.min}
                              onChange={(e) =>
                                patch(q.id, { min: Number(e.target.value) })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <Label htmlFor={`max-${q.id}`}>ค่าสูงสุด</Label>
                            <Input
                              id={`max-${q.id}`}
                              type="number"
                              min="1"
                              max="10"
                              value={q.max}
                              onChange={(e) =>
                                patch(q.id, { max: Number(e.target.value) })
                              }
                            />
                          </div>
                        </div>
                      )}
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            patch(q.id, { required: e.target.checked })
                          }
                        />
                        จำเป็นต้องตอบ
                      </label>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        questions: [
                          ...draft.questions,
                          {
                            id: crypto.randomUUID(),
                            text: "",
                            type: "CHOICE",
                            required: true,
                            options: ["", ""],
                            correctOption: null,
                            min: 1,
                            max: 5,
                          },
                        ],
                      })
                    }
                  >
                    เพิ่มคำถาม
                  </Button>
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button onClick={save}>บันทึกร่างเครื่องมือ</Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      ปิดร่างที่กำลังแก้ไข
                    </Button>
                  </div>
                </fieldset>
              </CardContent>
            </Card>
          )}
          {!data.forms.length ? (
            <EmptyState
              title="ยังไม่มีเครื่องมือที่เปิดให้ใช้"
              description="ผู้สอนสร้างคำถามและอนุมัติรุ่นก่อนเริ่มเก็บคำตอบ"
            />
          ) : (
            data.forms.map((f) => (
              <Card key={f.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{f.title}</CardTitle>
                    <Badge
                      variant={
                        f.status === "APPROVED" ? "success" : "secondary"
                      }
                    >
                      {f.status === "APPROVED" ? "อนุมัติแล้ว" : "ร่าง"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    {formKinds[f.kind]} · รุ่น {f.config.version} ·{" "}
                    {f.config.questions.length} ข้อ ·{" "}
                    {f.config.instrumentCode || "ยังไม่ระบุรหัสชุด"}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {f.config.instructions}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {f.canEdit && f.status === "DRAFT" && (
                      <>
                        <Button
                          variant="outline"
                          disabled={editing || command.disabled}
                          onClick={() => open(f)}
                        >
                          แก้ไขร่างคำถาม
                        </Button>
                        <Button
                          disabled={editing || command.disabled}
                          onClick={() => {
                            setApprove(f);
                            setAck(false);
                          }}
                        >
                          ตรวจและอนุมัติรุ่นนี้
                        </Button>
                      </>
                    )}
                    {data.teacher && (
                      <>
                        <Button
                          variant="outline"
                          disabled={editing}
                          onClick={() => {
                            open();
                            setTitle(`${f.title} · รุ่นใหม่`);
                            setKind(f.kind);
                            setDraft({
                              ...structuredClone(f.config),
                              version: `${f.config.version}-ใหม่`,
                            });
                          }}
                        >
                          สร้างร่างรุ่นใหม่จากชุดนี้
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setReport(report === f.id ? "" : f.id)}
                        >
                          คำตอบ / ผล {f.responseCount || 0} ชุด
                        </Button>
                      </>
                    )}
                    {f.status === "APPROVED" &&
                      (!data.teacher || f.kind === "EXPERT") && (
                        <Button
                          disabled={f.responded || command.disabled}
                          onClick={() => {
                            setAnswering(f);
                            setAnswers({});
                          }}
                        >
                          {f.responded ? "ส่งคำตอบแล้ว" : "เปิดแบบตอบ"}
                        </Button>
                      )}
                  </div>
                  {f.approvedBy && (
                    <p className="text-xs text-muted-foreground">
                      อนุมัติโดย {f.approvedBy} · เฉลยแบบทดสอบไม่ส่งให้ผู้เรียน
                    </p>
                  )}
                  {report === f.id && (
                    <div className="space-y-4 border-t pt-4">
                      {!f.responses?.length ? (
                        <p className="text-sm text-muted-foreground">
                          ยังไม่มีคำตอบ
                        </p>
                      ) : (
                        f.responses.map((r) => (
                          <div
                            key={r.id}
                            className="space-y-2 rounded-lg border p-4"
                          >
                            <p className="break-all text-sm font-medium">
                              รหัสผู้ตอบ {r.respondentCode}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(r.submittedAt).toLocaleString("th-TH", {
                                timeZone: "Asia/Bangkok",
                              })}
                              {r.score
                                ? ` · ตัวเลือกที่ตอบถูก ${r.score.correct}/${r.score.total} ข้อ`
                                : ""}
                            </p>
                            {f.config.questions.map((q, i) => (
                              <p
                                key={q.id}
                                className="whitespace-pre-wrap text-sm"
                              >
                                {i + 1}. {q.text} →{" "}
                                {q.type === "CHOICE" &&
                                typeof r.answers[q.id] === "number"
                                  ? q.options[Number(r.answers[q.id])]
                                  : (r.answers[q.id] ?? "ไม่ตอบ")}
                              </p>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
      <Dialog
        open={!!approve}
        onOpenChange={(open) => {
          if (!open) setApprove(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <CommandFeedback command={command} />
          <DialogTitle>ตรวจเครื่องมือก่อนเปิดเก็บคำตอบ</DialogTitle>
          <DialogDescription>
            ตรวจข้อความ ตัวเลือก เฉลย ช่วงมาตราส่วน และคำชี้แจง
            รุ่นที่อนุมัติแล้วแก้คำถามทับไม่ได้
            การรับรองคุณภาพงานวิจัยยังต้องใช้กระบวนการของผู้สอนและผู้เชี่ยวชาญ
          </DialogDescription>
          {approve?.config.questions.map((q, i) => (
            <div key={q.id} className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                {i + 1}. {q.text}
              </p>
              {q.type === "CHOICE" &&
                q.options.map((o, n) => (
                  <p key={n}>
                    {n + 1}. {o}
                    {q.correctOption === n ? " · เฉลย" : ""}
                  </p>
                ))}
              {q.type === "SCALE" && (
                <p>
                  ช่วง {q.min} ถึง {q.max}
                </p>
              )}
            </div>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            ผู้สอนตรวจเนื้อหาและยืนยันให้ใช้รุ่นนี้แล้ว
          </label>
          <Button
            disabled={!ack || command.disabled}
            onClick={() =>
              void command.send(
                "/api/research",
                {
                  action: "approve",
                  formId: approve!.id,
                  expectedConfigHash: approve!.configHash,
                  acknowledge: true,
                },
                () => {
                  setApprove(null);
                  reload();
                },
              )
            }
          >
            ยืนยันอนุมัติรุ่นเครื่องมือ
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!answering}
        onOpenChange={(open) => {
          if (!open) setAnswering(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <CommandFeedback command={command} />
          <DialogTitle>{answering?.title}</DialogTitle>
          <DialogDescription>
            {answering?.config.instructions ||
              "ตอบตามคำถามของเครื่องมือรุ่นนี้ แล้วตรวจคำตอบก่อนส่ง"}
          </DialogDescription>
          {answering?.config.questions.map((q, i) => (
            <div className="space-y-2 rounded-lg border p-3 text-sm" key={q.id}>
              <Label htmlFor={`answer-${q.id}`}>
                {i + 1}. {q.text}
                {q.required ? " *" : ""}
              </Label>
              {q.type === "TEXT" ? (
                <textarea
                  disabled={command.disabled}
                  id={`answer-${q.id}`}
                  className="min-h-24 w-full rounded-lg border p-3"
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [q.id]: e.target.value })
                  }
                />
              ) : (
                <select
                  disabled={command.disabled}
                  id={`answer-${q.id}`}
                  className={selectClass}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      [q.id]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                >
                  <option value="">เลือกคำตอบ</option>
                  {q.type === "CHOICE"
                    ? q.options.map((o, n) => (
                        <option key={n} value={n}>
                          {o}
                        </option>
                      ))
                    : Array.from({ length: q.max - q.min + 1 }, (_, n) => (
                        <option key={n} value={q.min + n}>
                          {q.min + n}
                        </option>
                      ))}
                </select>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            ตรวจคำตอบก่อนส่ง เมื่อส่งแล้วแก้ทับไม่ได้
            การเชื่อมต่อขัดข้องกดตรวจผลรายการเดิมได้
          </p>
          <Button
            disabled={command.disabled}
            onClick={() =>
              void command.send(
                "/api/research",
                { action: "answer", formId: answering!.id, answers },
                () => {
                  setAnswering(null);
                  reload();
                },
              )
            }
          >
            ยืนยันส่งคำตอบ
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
