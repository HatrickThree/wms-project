"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingState, Feedback } from "./common";
import { ScanInput } from "./scan-input";
import { useWarehouseCommand, CommandFeedback } from "./use-warehouse-command";
import {
  useUnsavedChanges,
  useGuardedAction,
} from "@/components/layout/navigation-guard";
import { request } from "@/lib/wms";
import {
  LessonConfigSchema,
  tpqiUnits,
  taskLabels,
  scenarioLabels,
  type LessonConfig,
  type PhysicalShelf,
} from "@/lib/training";

type Criterion = LessonConfig["criteria"][number];
interface RoundSummary {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  seed: string;
  fixtureHash: string;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}
interface Lesson {
  id: string;
  title: string;
  status: string;
  config: LessonConfig;
  configHash: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rounds: RoundSummary[];
}
interface Round extends Omit<RoundSummary, "workspaceId"> {
  lesson: { title: string; approvedBy: string; approvedAt: string };
  config: LessonConfig;
  reviewedBy: string | null;
  participants: { id: string; username: string; displayName: string }[];
  assessments: {
    userId: string;
    username: string;
    displayName: string;
    decision: string;
    note: string;
    reviewedBy: string;
    criteria: { id: string; result: string; evidence: string }[];
  }[];
  metrics: {
    elapsedSeconds: number | null;
    validatedPickCommands: number;
    correctPickCommands: number;
    pickCommandAccuracy: number | null;
    successfulCommands: number;
    rejectedCommands: number;
    plannedDistanceMeters: number | null;
    distanceMeters: null;
  };
  events: {
    id: string;
    actor: string;
    actorRole: string;
    type: string;
    success: boolean;
    createdAt: string;
    details: Record<string, unknown>;
  }[];
  truth?: PhysicalShelf[];
}
interface Data {
  teacher: boolean;
  isTraining: boolean;
  roster: { id: string; username: string; displayName: string }[];
  lessons: Lesson[];
  round: Round | null;
}
const selectClass = "h-12 w-full rounded-lg border bg-background px-3 text-sm";
const statusLabels: Record<string, string> = {
  DRAFT: "ร่าง",
  OPEN: "เปิดโจทย์แล้ว",
  READY: "พร้อมเริ่ม",
  ACTIVE: "กำลังฝึก",
  SUBMITTED: "ส่งงานแล้ว",
  REVIEWED: "ผู้สอนตรวจแล้ว",
};
const decisions: Record<string, string> = {
  COMPETENT: "ผ่านเกณฑ์",
  NOT_YET: "ยังไม่ผ่าน",
  INCOMPLETE: "หลักฐานไม่ครบ",
};
const methodLabels: Record<string, string> = {
  SYSTEM: "หลักฐานจากระบบ",
  OBSERVATION: "ผู้สอนสังเกตปฏิบัติ",
  WRITTEN: "ทดสอบความรู้",
  INTERVIEW: "สัมภาษณ์",
};
const eventLabels: Record<string, string> = {
  "training.start": "เริ่มรอบฝึก",
  "training.submit": "ส่งงานรอบฝึก",
  "training.review": "ประเมินสมรรถนะรายบุคคล",
  receive: "รับสินค้าเข้า",
  transfer: "จัดเก็บ / ย้ายตำแหน่ง",
  "create-order": "สร้างคำสั่งซื้อ",
  "count-start": "เริ่มตรวจนับ",
  "count-entry": "บันทึกผลนับ",
  "count-submit": "ส่งผลนับ",
  "count-approve": "อนุมัติผลนับ",
  "count-cancel": "ยกเลิกงานนับ",
  "map.route": "สร้างแผนเส้นทางหยิบ",
  "map.save": "บันทึกผังคลัง",
  "research.save": "บันทึกร่างเครื่องมือ",
  "research.approve": "อนุมัติเครื่องมือ",
};
const orderActionLabels: Record<string, string> = {
  reserve: "จองสินค้า",
  pick: "ตรวจหยิบสินค้า",
  ship: "ยืนยันจ่ายสินค้า",
  cancel: "ยกเลิกคำสั่งซื้อ",
};
const initial = (): LessonConfig => ({
  task: "COUNT",
  scenario: "NORMAL",
  instructions: "",
  mode: "INDIVIDUAL",
  seed: "",
  sameSeed: true,
  groups: [],
  criteria: [],
});
const paths = {
  RECEIVE: "/inbound",
  PUTAWAY: "/transfers",
  PICK: "/outbound",
  COUNT: "/counts",
};
export function TrainingScreen() {
  const [data, setData] = useState<Data | null>(null),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(false),
    [lessonId, setLessonId] = useState("");
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<LessonConfig>(initial);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [approve, setApprove] = useState<Lesson | null>(null),
    [ack, setAck] = useState(false);
  const [location, setLocation] = useState("");
  const [shelf, setShelf] = useState<{
    locationBarcode: string;
    items: PhysicalShelf[];
  } | null>(null);
  const [review, setReview] = useState(false),
    [decision, setDecision] = useState("INCOMPLETE"),
    [note, setNote] = useState(""),
    [results, setResults] = useState<
      Record<string, { result: string; evidence: string }>
    >({});
  const [reviewUserId, setReviewUserId] = useState("");
  const command = useWarehouseCommand();
  const router = useRouter();
  useUnsavedChanges(editing || review || command.uncertain);
  const reload = () => setRefresh((n) => n + 1);
  useEffect(() => {
    let active = true;
    request<Data>("/api/training")
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
  const switchRound = async (workspaceId: string) => {
    setError("");
    try {
      await request("/api/workspaces/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      router.refresh();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปลี่ยนพื้นที่ไม่ได้");
    }
  };
  const openDraft = (l?: Lesson) => {
    setLessonId(l?.id || "");
    setTitle(l?.title || "");
    setDraft(l ? structuredClone(l.config) : initial());
    setAssigned(
      l
        ? Object.fromEntries(
            l.config.groups.flatMap((g) => g.userIds.map((id) => [id, g.name])),
          )
        : {},
    );
    setEditing(true);
    command.setFeedback(null);
  };
  const save = () => {
    const groups =
      draft.mode === "INDIVIDUAL"
        ? Object.keys(assigned).map((id) => ({
            name: data!.roster.find((s) => s.id === id)?.displayName || id,
            userIds: [id],
          }))
        : Object.entries(assigned).reduce<LessonConfig["groups"]>(
            (groups, [id, name]) => {
              const group = groups.find((g) => g.name === name.trim());
              if (group) group.userIds.push(id);
              else groups.push({ name: name.trim(), userIds: [id] });
              return groups;
            },
            [],
          );
    const parsed = LessonConfigSchema.safeParse({ ...draft, groups });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    void command.send(
      "/api/training",
      {
        action: "save",
        ...(lessonId ? { id: lessonId } : {}),
        title,
        config: parsed.data,
      },
      () => {
        setEditing(false);
        reload();
      },
    );
  };
  const updateCriterion = (id: string, patch: Partial<Criterion>) =>
    setDraft((c) => ({
      ...c,
      criteria: c.criteria.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  const round = data?.round;
  const guarded = useGuardedAction();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LEARNING / WAREHOUSE PRACTICE"
        title="ห้องเรียนและรอบฝึก"
        description="โจทย์แต่ละคนหรือทีมใช้คลังแยกจากธุรกิจ เก็บหลักฐานงานจริงในระบบ และให้ผู้สอนสรุปสมรรถนะตามเกณฑ์ที่ตรวจแล้ว"
        action={
          <>
            <Button
              variant="outline"
              disabled={command.disabled}
              onClick={() =>
                guarded(() => {
                  setEditing(false);
                  setReview(false);
                  reload();
                })
              }
            >
              โหลดข้อมูลใหม่
            </Button>
            {data?.teacher && (
              <a href="/api/training/export" download>
                <Button variant="outline">ผลฝึก CSV</Button>
              </a>
            )}
            <Link href="/research">
              <Button variant="outline">แบบทดสอบ / แบบวิจัย</Button>
            </Link>
          </>
        }
      />
      <CommandFeedback command={command} />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {!data ? (
        <LoadingState />
      ) : !data.isTraining ? (
        <EmptyState
          title="เลือกพื้นที่ฝึกก่อน"
          description="สร้างหรือเลือกพื้นที่ฝึกในหน้าพื้นที่ธุรกิจ / การฝึก แล้วเตรียมข้อมูลแม่แบบในพื้นที่นั้น"
          action={
            <Link href="/workspaces">
              <Button>เลือกพื้นที่ฝึก</Button>
            </Link>
          }
        />
      ) : round ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>
                  <GraduationCap className="mr-2 inline size-5" />
                  {round.lesson.title} · {round.name}
                </CardTitle>
                <Badge
                  variant={round.status === "ACTIVE" ? "warning" : "secondary"}
                >
                  {statusLabels[round.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {round.config.instructions}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{taskLabels[round.config.task]}</Badge>
                <Badge variant="outline">
                  {round.config.mode === "TEAM"
                    ? "คลังร่วมของทีม"
                    : "คลังแยกรายคน"}
                </Badge>
                <Badge variant="outline">
                  สถานการณ์จำลองแบบกฎ · ไม่มีโมเดล AI
                </Badge>
              </div>
              <p className="break-all text-xs text-muted-foreground">
                Seed: {round.seed} · แม่แบบ {round.fixtureHash.slice(0, 16)} ·
                กติกา SHELF_V1 / URGENT_V1
              </p>
              <p className="text-xs text-muted-foreground">
                ผู้ตรวจเกณฑ์ {round.lesson.approvedBy} ·
                วันรับเข้าและวันหมดอายุคงตามแม่แบบ ไม่เลื่อนวันให้อัตโนมัติ
              </p>
              <div className="flex flex-wrap gap-2">
                {round.status === "READY" && (
                  <Button
                    disabled={command.disabled}
                    onClick={() =>
                      void command.send(
                        "/api/training",
                        { action: "start" },
                        () => {
                          reload();
                        },
                      )
                    }
                  >
                    <Play />
                    เริ่มรอบและจับเวลา
                  </Button>
                )}
                {round.status === "ACTIVE" && (
                  <>
                    <Link href={paths[round.config.task]}>
                      <Button>เปิดงาน{taskLabels[round.config.task]}</Button>
                    </Link>
                    {round.config.task === "PICK" && (
                      <Link href="/maps">
                        <Button variant="outline">วางเส้นทางหยิบ</Button>
                      </Link>
                    )}
                    <Button
                      variant="outline"
                      disabled={command.disabled}
                      onClick={() =>
                        void command.send(
                          "/api/training",
                          { action: "submit" },
                          () => {
                            reload();
                          },
                        )
                      }
                    >
                      ส่งงานและหยุดเวลา
                    </Button>
                  </>
                )}
                {data.teacher && round.status === "SUBMITTED" && (
                  <Button
                    onClick={() => {
                      setResults(
                        Object.fromEntries(
                          round.config.criteria.map((c) => [
                            c.id,
                            { result: "MISSING", evidence: "" },
                          ]),
                        ),
                      );
                      setReviewUserId(
                        round.participants.find(
                          (p) =>
                            !round.assessments.some((a) => a.userId === p.id),
                        )?.id || "",
                      );
                      setNote("");
                      setDecision("INCOMPLETE");
                      setReview(true);
                    }}
                  >
                    ตรวจหลักฐานและสรุปสมรรถนะ
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <Clock3 className="mb-2 size-5 text-primary" />
                <p className="text-sm text-muted-foreground">
                  เวลาตั้งแต่เริ่มถึงส่งงาน
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {round.metrics.elapsedSeconds === null
                    ? "ยังไม่สิ้นสุด"
                    : `${round.metrics.elapsedSeconds} วินาที`}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  เวลารวมของรอบ รวมเวลาพัก
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <CheckCircle2 className="mb-2 size-5 text-primary" />
                <p className="text-sm text-muted-foreground">
                  คำสั่งตรวจหยิบที่ผ่าน
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {round.metrics.pickCommandAccuracy === null
                    ? "ยังไม่มีข้อมูล"
                    : `${round.metrics.pickCommandAccuracy}%`}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {round.metrics.correctPickCommands}/
                  {round.metrics.validatedPickCommands} คำสั่งที่ผ่านการตรวจ
                  ไม่รวมข้อมูลผิดรูปแบบก่อนเข้าคำสั่งคลัง
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">
                  หลักฐานคำสั่งผู้เรียน
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  สำเร็จ {round.metrics.successfulCommands}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  ปฏิเสธ {round.metrics.rejectedCommands} ·
                  ไม่นับงานที่ผู้สอนทำแทน ไม่มีคะแนนรวมถ่วงน้ำหนัก
                </p>
              </CardContent>
            </Card>
          </div>
          <p className="text-sm text-muted-foreground">
            ระยะตามแผนที่เก็บไว้:{" "}
            {round.metrics.plannedDistanceMeters === null
              ? "ยังไม่มีแผนเส้นทาง"
              : `${round.metrics.plannedDistanceMeters.toFixed(2)} เมตร`}{" "}
            · รวมแผนล่าสุดต่อคำสั่งซื้อ/คลัง ไม่ใช่ระยะเดินที่วัดจริง
          </p>
          {round.config.mode === "TEAM" && (
            <p className="text-sm text-muted-foreground">
              ตัวชี้วัดนี้เป็นผลงานรวมของทีม
              ผู้สอนตรวจหลักฐานรายคนจากชื่อผู้ทำรายการได้
              ไม่ใช้ตัวเลขทีมแทนผลรายบุคคล
            </p>
          )}
          {round.status === "ACTIVE" && round.config.task === "COUNT" && (
            <Card>
              <CardHeader>
                <CardTitle>ชั้นสินค้าจำลองสำหรับตรวจนับ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  สแกนหรือกรอกรหัสตำแหน่งเพื่อดูสินค้าที่วางในสถานการณ์จำลอง
                  แล้วบันทึกผลในงานตรวจนับ ระบบไม่แสดงยอดบัญชีอ้างอิงให้ผู้เรียน
                </p>
                <Label htmlFor="training-shelf">ตำแหน่งที่จะตรวจนับ</Label>
                <ScanInput
                  id="training-shelf"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onScanValue={setLocation}
                  scannerTitle="สแกนตำแหน่งชั้นจำลอง"
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    setError("");
                    try {
                      setShelf(
                        await request(
                          `/api/training?locationBarcode=${encodeURIComponent(location)}`,
                        ),
                      );
                    } catch (e) {
                      setShelf(null);
                      setError(
                        e instanceof Error ? e.message : "อ่านชั้นจำลองไม่ได้",
                      );
                    }
                  }}
                >
                  เปิดชั้นจำลองตำแหน่งนี้
                </Button>
                {shelf && (
                  <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                    <h3 className="font-medium">
                      {shelf.locationBarcode} · สินค้าในสถานการณ์จำลอง
                    </h3>
                    {!shelf.items.length ? (
                      <p className="text-sm">ไม่พบสินค้าในตำแหน่งนี้</p>
                    ) : (
                      shelf.items.map((item, i) => (
                        <div key={i} className="rounded-lg border bg-white p-3">
                          <p className="font-medium">
                            {item.sku} · Lot {item.lotNumber || "—"}
                          </p>
                          <p className="mt-1 text-sm">
                            พบ {item.quantity} หน่วยหลัก
                            {item.expiresOn
                              ? ` · หมดอายุ ${item.expiresOn}`
                              : ""}
                          </p>
                          {item.serials.length > 0 && (
                            <p className="mt-1 break-all text-sm">
                              S/N: {item.serials.join(", ")}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>เกณฑ์สมรรถนะที่ผู้สอนอนุมัติ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                อ้างอิง TPQI ผู้ควบคุมคลังสินค้า ระดับ 3 เป็นฐานการจับคู่
                ต้องใช้หลักฐานความรู้และการปฏิบัติตามที่ผู้สอนกำหนด
                โดยเฉพาะความปลอดภัยและการทำงานทางกายภาพ
              </p>
              {round.config.criteria.map((c) => (
                <div key={c.id} className="rounded-xl border p-4">
                  <p className="text-xs text-primary">
                    {c.unitCode} · {methodLabels[c.method]}
                    {c.required ? " · จำเป็น" : ""}
                  </p>
                  <p className="mt-2 text-sm">{c.description}</p>
                </div>
              ))}
              {round.assessments.map((assessment) => (
                <div
                  key={assessment.userId}
                  className="space-y-3 rounded-xl bg-blue-50 p-4"
                >
                  <p className="font-semibold">
                    {assessment.displayName} · {decisions[assessment.decision]}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {assessment.note}
                  </p>
                  {assessment.criteria.map((c) => (
                    <p key={c.id} className="whitespace-pre-wrap text-sm">
                      {
                        round.config.criteria.find((q) => q.id === c.id)
                          ?.description
                      }{" "}
                      ·{" "}
                      {
                        (
                          {
                            MET: "ผ่าน",
                            NOT_MET: "ยังไม่ผ่าน",
                            MISSING: "หลักฐานไม่ครบ",
                          } as Record<string, string>
                        )[c.result]
                      }{" "}
                      · {c.evidence}
                    </p>
                  ))}
                  <p className="text-xs">
                    ผู้สอน {assessment.reviewedBy} · ผลรายบุคคลของโจทย์นี้
                    ไม่ใช่การรับรองคุณวุฒิ TPQI
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>เหตุการณ์ในรอบ (ล่าสุด 200)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {round.events.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <span>
                    {e.actor} ·{" "}
                    {e.type === "order-action"
                      ? orderActionLabels[String(e.details.action)] ||
                        "ทำงานคำสั่งซื้อ"
                      : eventLabels[e.type] || "บันทึกงานคลัง"}{" "}
                    · {e.success ? "สำเร็จ" : "ปฏิเสธ"}
                    {e.details.rejection ? ` · ${e.details.rejection}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("th-TH", {
                      timeZone: "Asia/Bangkok",
                    })}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : data.teacher ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button disabled={editing} onClick={() => openDraft()}>
              <Plus />
              สร้างร่างโจทย์
            </Button>
            <Link href="/catalog">
              <Button variant="outline">เตรียมข้อมูลแม่แบบ</Button>
            </Link>
            <Link href="/workspaces">
              <Button variant="outline">จัดการสมาชิกผู้เรียน</Button>
            </Link>
          </div>
          {editing && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {lessonId ? "แก้ไขร่างโจทย์" : "สร้างร่างโจทย์ใหม่"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <fieldset disabled={command.disabled} className="space-y-5">
                  <div className="field-group">
                    <Label htmlFor="lesson-title">ชื่อโจทย์</Label>
                    <Input
                      id="lesson-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="field-group">
                      <Label htmlFor="lesson-task">งานที่ให้ฝึก</Label>
                      <select
                        disabled={command.disabled}
                        id="lesson-task"
                        className={selectClass}
                        value={draft.task}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            task: e.target.value as LessonConfig["task"],
                            scenario: "NORMAL",
                          })
                        }
                      >
                        {Object.entries(taskLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <Label htmlFor="lesson-scenario">สถานการณ์</Label>
                      <select
                        disabled={command.disabled}
                        id="lesson-scenario"
                        className={selectClass}
                        value={draft.scenario}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            scenario: e.target
                              .value as LessonConfig["scenario"],
                          })
                        }
                      >
                        {Object.entries(scenarioLabels)
                          .filter(
                            ([k]) =>
                              k === "NORMAL" ||
                              (draft.task === "COUNT" &&
                                ["SHORTAGE", "EXCESS"].includes(k)) ||
                              (draft.task === "PICK" && k === "URGENT"),
                          )
                          .map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <Label htmlFor="lesson-mode">รูปแบบคลังผู้เรียน</Label>
                      <select
                        disabled={command.disabled}
                        id="lesson-mode"
                        className={selectClass}
                        value={draft.mode}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            mode: e.target.value as LessonConfig["mode"],
                          })
                        }
                      >
                        <option value="INDIVIDUAL">แยกคลังรายคน</option>
                        <option value="TEAM">ใช้คลังร่วมกันภายในทีม</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <Label htmlFor="lesson-seed">
                        รหัสสุ่ม (Seed) สำหรับทำซ้ำ
                      </Label>
                      <Input
                        id="lesson-seed"
                        value={draft.seed}
                        onChange={(e) =>
                          setDraft({ ...draft, seed: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.sameSeed}
                      onChange={(e) =>
                        setDraft({ ...draft, sameSeed: e.target.checked })
                      }
                    />
                    ใช้ Seed เดียวกันทุกคน/ทีมเพื่อเปรียบเทียบสถานการณ์เดียวกัน
                  </label>
                  <div className="field-group">
                    <Label htmlFor="lesson-instructions">
                      คำสั่งงานและเงื่อนไขส่งงาน
                    </Label>
                    <textarea
                      disabled={command.disabled}
                      id="lesson-instructions"
                      className="min-h-28 rounded-lg border bg-background p-3 text-sm"
                      value={draft.instructions}
                      onChange={(e) =>
                        setDraft({ ...draft, instructions: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      งานนับต้องส่งผลครบทุก SKU ในแม่แบบ
                      งานหยิบต้องจ่ายอย่างน้อยหนึ่งคำสั่งซื้อและปิดเอกสารค้าง
                      งานรับ/ย้ายต้องมีหลักฐานผู้เรียนอย่างน้อยหนึ่งรายการ
                      ผู้สอนตรวจความครบตามคำสั่งงานอีกครั้ง
                    </p>
                  </div>
                  <h3 className="font-medium">ผู้เรียนจากสมาชิกพื้นที่นี้</h3>
                  {!data.roster.length && (
                    <p className="text-sm text-muted-foreground">
                      ยังไม่มีผู้เรียน เพิ่มสมาชิกในหน้าพื้นที่ธุรกิจ /
                      การฝึกก่อน
                    </p>
                  )}
                  {data.roster.map((s) => (
                    <div
                      className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                      key={s.id}
                    >
                      <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={s.id in assigned}
                          onChange={(e) =>
                            setAssigned((old) => {
                              const v = { ...old };
                              if (e.target.checked) v[s.id] = "ทีม 1";
                              else delete v[s.id];
                              return v;
                            })
                          }
                        />
                        {s.displayName} · {s.username}
                      </label>
                      {draft.mode === "TEAM" && s.id in assigned && (
                        <Input
                          aria-label={`ทีมของ ${s.username}`}
                          className="sm:w-40"
                          value={assigned[s.id]}
                          onChange={(e) =>
                            setAssigned({ ...assigned, [s.id]: e.target.value })
                          }
                        />
                      )}
                    </div>
                  ))}
                  <div className="space-y-2">
                    <h3 className="font-medium">
                      ร่างรายการเกณฑ์และการจับคู่ TPQI
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      เพิ่มเกณฑ์ที่ผู้สอนจะตรวจจริง ระบุหน่วยสมรรถนะ
                      วิธีเก็บหลักฐาน และข้อจำเป็น
                      ข้อความนี้เป็นเกณฑ์ของโจทย์ที่ต้องตรวจเทียบมาตรฐานก่อนอนุมัติ
                    </p>
                    <a
                      className="text-sm text-primary underline"
                      href="https://tpqi-net.tpqi.go.th/qualifications/4706"
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดมาตรฐานอาชีพผู้ควบคุมคลังสินค้า ระดับ 3
                    </a>
                  </div>
                  {draft.criteria.map((c) => (
                    <div key={c.id} className="space-y-3 rounded-xl border p-4">
                      <select
                        disabled={command.disabled}
                        aria-label={`หน่วยสมรรถนะ ${c.id}`}
                        className={selectClass}
                        value={c.unitCode}
                        onChange={(e) =>
                          updateCriterion(c.id, { unitCode: e.target.value })
                        }
                      >
                        {tpqiUnits.map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.code} ({u.book}) · {u.name}
                          </option>
                        ))}
                      </select>
                      <textarea
                        disabled={command.disabled}
                        aria-label={`เกณฑ์ ${c.id}`}
                        className="min-h-24 w-full rounded-lg border p-3 text-sm"
                        value={c.description}
                        onChange={(e) =>
                          updateCriterion(c.id, { description: e.target.value })
                        }
                      />
                      <select
                        disabled={command.disabled}
                        aria-label={`วิธีประเมิน ${c.id}`}
                        className={selectClass}
                        value={c.method}
                        onChange={(e) =>
                          updateCriterion(c.id, {
                            method: e.target.value as Criterion["method"],
                          })
                        }
                      >
                        {Object.entries(methodLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center justify-between">
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={c.required}
                            onChange={(e) =>
                              updateCriterion(c.id, {
                                required: e.target.checked,
                              })
                            }
                          />
                          เกณฑ์จำเป็นสำหรับผ่าน
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`ลบเกณฑ์ ${c.id}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              criteria: draft.criteria.filter(
                                (x) => x.id !== c.id,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        criteria: [
                          ...draft.criteria,
                          {
                            id: crypto.randomUUID(),
                            unitCode: tpqiUnits[0].code,
                            description: "",
                            method: "OBSERVATION",
                            required: true,
                          },
                        ],
                      })
                    }
                  >
                    เพิ่มเกณฑ์
                  </Button>
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button onClick={save}>บันทึกร่างโจทย์</Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      ปิดร่างที่กำลังแก้ไข
                    </Button>
                  </div>
                </fieldset>
              </CardContent>
            </Card>
          )}
          {!data.lessons.length ? (
            <EmptyState
              title="ยังไม่มีโจทย์"
              description="เตรียมสินค้าและสต็อกในแม่แบบฝึก เพิ่มผู้เรียน แล้วสร้างร่างโจทย์"
            />
          ) : (
            data.lessons.map((l) => (
              <Card key={l.id}>
                <CardHeader>
                  <div className="flex flex-wrap justify-between gap-2">
                    <CardTitle>{l.title}</CardTitle>
                    <Badge variant="secondary">{statusLabels[l.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm">
                    {taskLabels[l.config.task]} ·{" "}
                    {scenarioLabels[l.config.scenario]} ·{" "}
                    {l.config.mode === "TEAM"
                      ? "คลังร่วมในทีม"
                      : "คลังแยกรายคน"}{" "}
                    · {l.config.groups.length} คลัง · {l.config.criteria.length}{" "}
                    เกณฑ์
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {l.config.instructions}
                  </p>
                  {l.status === "DRAFT" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={editing || command.disabled}
                        onClick={() => openDraft(l)}
                      >
                        แก้ไขร่าง
                      </Button>
                      <Button
                        variant="outline"
                        disabled={editing || command.disabled}
                        onClick={() => {
                          setApprove(l);
                          setAck(false);
                        }}
                      >
                        ตรวจและอนุมัติเกณฑ์
                      </Button>
                      <Button
                        disabled={!l.approvedAt || editing || command.disabled}
                        onClick={() =>
                          void command.send(
                            "/api/training",
                            { action: "publish", lessonId: l.id },
                            () => {
                              reload();
                            },
                          )
                        }
                      >
                        เปิดโจทย์และสร้างคลังแยก
                      </Button>
                    </div>
                  )}
                  {l.approvedBy && (
                    <p className="text-xs text-muted-foreground">
                      อนุมัติการจับคู่โดย {l.approvedBy}
                    </p>
                  )}
                  {l.rounds.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <span className="text-sm">
                        {r.name} · {statusLabels[r.status]}
                      </span>
                      <Button
                        variant="outline"
                        disabled={editing || command.disabled}
                        onClick={() => void switchRound(r.workspaceId)}
                      >
                        เข้าคลังรอบนี้
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))
          )}
        </>
      ) : (
        <EmptyState
          title="เลือกคลังรอบฝึกที่ได้รับมอบหมาย"
          description="เมื่อผู้สอนเปิดโจทย์ ระบบจะเพิ่มพื้นที่ฝึกของคุณหรือทีมในหน้าพื้นที่ธุรกิจ / การฝึก"
          action={
            <Link href="/workspaces">
              <Button>เลือกคลังรอบฝึก</Button>
            </Link>
          }
        />
      )}
      <Dialog
        open={!!approve}
        onOpenChange={(open) => {
          if (!open) setApprove(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <CommandFeedback command={command} />
          <DialogTitle>ผู้สอนตรวจการจับคู่หน่วยสมรรถนะ</DialogTitle>
          <DialogDescription>
            ตรวจความสอดคล้องของเกณฑ์ วิธี และหลักฐานกับ TPQI ระดับ 3
            ก่อนเปิดประเมิน
            ข้อมูลระบบเพียงอย่างเดียวไม่แทนการสังเกตความปลอดภัยหรือการปฏิบัติทางกายภาพ
          </DialogDescription>
          {approve?.config.criteria.map((c) => (
            <div className="rounded-lg border p-3 text-sm" key={c.id}>
              <p className="font-medium">
                {c.unitCode} · {methodLabels[c.method]}
              </p>
              <p className="mt-2">{c.description}</p>
            </div>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            ตรวจเทียบหน่วยสมรรถนะและหลักฐานของโจทย์นี้แล้ว
          </label>
          <Button
            disabled={!ack || command.disabled}
            onClick={() =>
              void command.send(
                "/api/training",
                {
                  action: "approve",
                  lessonId: approve!.id,
                  acknowledge: true,
                  expectedConfigHash: approve!.configHash,
                },
                () => {
                  setApprove(null);
                  reload();
                },
              )
            }
          >
            ยืนยันการตรวจของผู้สอน
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <CommandFeedback command={command} />
          <DialogTitle>สรุปสมรรถนะตามหลักฐาน</DialogTitle>
          <DialogDescription>
            ตรวจทุกเกณฑ์และระบุหลักฐาน เช่น เลขเอกสาร เหตุการณ์ในระบบ แบบทดสอบ
            หรือสิ่งที่สังเกต ผลผ่านต้องมีหลักฐานครบทุกเกณฑ์จำเป็น
          </DialogDescription>
          <Label htmlFor="review-user">ผู้เรียนที่ประเมินรายบุคคล</Label>
          <select
            disabled={command.disabled}
            id="review-user"
            className={selectClass}
            value={reviewUserId}
            onChange={(e) => {
              setReviewUserId(e.target.value);
              setNote("");
              setDecision("INCOMPLETE");
              setResults(
                Object.fromEntries(
                  round!.config.criteria.map((c) => [
                    c.id,
                    { result: "MISSING", evidence: "" },
                  ]),
                ),
              );
            }}
          >
            {round?.participants
              .filter((p) => !round.assessments.some((a) => a.userId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} · {p.username}
                </option>
              ))}
          </select>
          {round?.config.criteria.map((c) => (
            <div className="space-y-2 rounded-lg border p-3 text-sm" key={c.id}>
              <p>
                {c.unitCode} · {c.description}
              </p>
              <select
                disabled={command.disabled}
                aria-label={`ผลเกณฑ์ ${c.id}`}
                className={selectClass}
                value={results[c.id]?.result || "MISSING"}
                onChange={(e) =>
                  setResults({
                    ...results,
                    [c.id]: { ...results[c.id], result: e.target.value },
                  })
                }
              >
                <option value="MISSING">หลักฐานไม่ครบ</option>
                <option value="NOT_MET">ยังไม่ผ่าน</option>
                <option value="MET">ผ่าน</option>
              </select>
              <textarea
                disabled={command.disabled}
                aria-label={`หลักฐานเกณฑ์ ${c.id}`}
                className="min-h-20 w-full rounded-lg border p-3"
                value={results[c.id]?.evidence || ""}
                onChange={(e) =>
                  setResults({
                    ...results,
                    [c.id]: { ...results[c.id], evidence: e.target.value },
                  })
                }
              />
            </div>
          ))}
          <Label htmlFor="round-decision">ผลสมรรถนะของโจทย์นี้</Label>
          <select
            disabled={command.disabled}
            id="round-decision"
            className={selectClass}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            {Object.entries(decisions).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
          <Label htmlFor="round-note">ข้อสังเกต / แนวทางพัฒนา</Label>
          <textarea
            disabled={command.disabled}
            id="round-note"
            className="min-h-24 rounded-lg border p-3 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            disabled={command.disabled}
            onClick={() =>
              void command.send(
                "/api/training",
                {
                  action: "review",
                  userId: reviewUserId,
                  decision,
                  note,
                  criteria: round!.config.criteria.map((c) => ({
                    id: c.id,
                    ...results[c.id],
                  })),
                },
                () => {
                  setReview(false);
                  reload();
                },
              )
            }
          >
            บันทึกผลผู้สอน
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
