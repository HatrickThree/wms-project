"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { PageHeader, LoadingState, Feedback, EmptyState } from "./common";
import { request } from "@/lib/wms";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { useWarehouseCommand, CommandFeedback } from "./use-warehouse-command";
import type { ABCClass } from "@/lib/abc";
import type { ABCConfig, ABCData } from "@/lib/abc-types";
const isoDay = (date: Date) =>
  new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const selectClass = "h-12 w-full rounded-lg border bg-background px-3 text-sm";
export function ABCScreen({ canApprove }: { canApprove: boolean }) {
  const [data, setData] = useState<ABCData | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const initialized = useRef(false);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ABCConfig>({
    windowDays: 90,
    thresholdA: 80,
    thresholdB: 95,
    tieRule: "SKU_ORDER",
    daysA: null,
    daysB: null,
    daysC: null,
  });
  const [chosen, setChosen] = useState<string[]>([]);
  const [classes, setClasses] = useState<Record<string, ABCClass>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const command = useWarehouseCommand();
  useUnsavedChanges(command.uncertain || open || chosen.length > 0);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(page),
      q,
      ...(runId ? { runId } : {}),
    });
    request<ABCData>(`/api/abc?${params}`)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError("");
        if (!initialized.current) {
          setTo(d.today);
          setFrom(
            isoDay(
              new Date(
                new Date(`${d.today}T00:00:00+07:00`).getTime() -
                  (d.settings.windowDays - 1) * 86400000,
              ),
            ),
          );
          initialized.current = true;
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh, q, page, runId]);
  const configNumber = (key: keyof ABCConfig, value: string) =>
    setConfig((c) => ({ ...c, [key]: value === "" ? null : Number(value) }));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ANALYSIS / ABC"
        title="ABC และรอบตรวจนับ"
        description="จัดกลุ่ม SKU จากความถี่เอกสารจ่ายที่ยืนยันแล้ว ผลวิเคราะห์เป็นข้อเสนอ ต้องยืนยันก่อนเปลี่ยนกลุ่มจริง"
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/counts">งานตรวจนับ</Link>
            </Button>
            {canApprove && (
              <Button
                variant="outline"
                disabled={command.disabled || !data}
                onClick={() => {
                  setConfig(data!.settings);
                  command.setFeedback(null);
                  setOpen(true);
                }}
              >
                ตั้งค่า ABC / รอบวัน
              </Button>
            )}
          </div>
        }
      />
      <CommandFeedback command={command} />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="field-group">
              <Label htmlFor="abc-from">วันที่เริ่มต้น</Label>
              <Input
                id="abc-from"
                type="date"
                value={from}
                disabled={command.disabled}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field-group">
              <Label htmlFor="abc-to">วันที่สิ้นสุด (เวลาไทย)</Label>
              <Input
                id="abc-to"
                type="date"
                value={to}
                max={data?.today}
                disabled={command.disabled}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button
              disabled={!canApprove || command.disabled || !from || !to}
              onClick={() =>
                void command.send(
                  "/api/abc",
                  { action: "analyze", fromDate: from, toDate: to },
                  (result) => {
                    setRunId(result.id);
                    setChosen([]);
                    setPage(1);
                    setRefresh((v) => v + 1);
                    return {
                      kind: "success",
                      text: "สร้างข้อเสนอแล้ว ยังไม่มีการเปลี่ยนกลุ่มสินค้า",
                    };
                  },
                )
              }
            >
              {command.busy ? "กำลังวิเคราะห์…" : "วิเคราะห์เป็นข้อเสนอ"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            นับเอกสารจ่ายไม่ซ้ำต่อ SKU รวมประวัติจ่ายเดิม
            ไม่นับจำนวนชิ้นหรือมูลค่า · สินค้าที่ไม่มีการจ่ายเสนอเป็น C ·
            ไม่ปรับตำแหน่งหรือยอดสต็อกอัตโนมัติ
          </p>
        </CardContent>
      </Card>
      {!data ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="field-group min-w-0 flex-1">
              <Label htmlFor="abc-run">
                ผลวิเคราะห์ที่เก็บไว้ (ล่าสุด 20 ชุด)
              </Label>
              <select
                id="abc-run"
                className={selectClass}
                disabled={command.disabled || chosen.length > 0}
                value={data.run?.id || ""}
                onChange={(e) => {
                  setRunId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="" disabled>
                  ยังไม่มีผลวิเคราะห์
                </option>
                {data.runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fromDate} ถึง {r.toDate} · {r.createdBy}
                  </option>
                ))}
              </select>
            </div>
            <Input
              className="max-w-xs"
              aria-label="ค้นหา SKU ในผล ABC"
              placeholder="ค้นหา SKU / สินค้า"
              value={q}
              disabled={command.disabled || chosen.length > 0}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {!data.run ? (
            <EmptyState
              title="ยังไม่มีข้อเสนอ ABC"
              description="ผู้มีสิทธิ์บันทึกการตั้งค่าและเลือกช่วงข้อมูลก่อนวิเคราะห์"
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  ข้อเสนอ {data.run.fromDate} – {data.run.toDate}
                </CardTitle>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  เส้นแบ่ง {data.run.thresholdA}% / {data.run.thresholdB}% · SKU
                  ที่ทำให้ข้ามเส้นอยู่กลุ่มก่อนเส้น ·{" "}
                  {data.run.tieRule === "SKU_ORDER"
                    ? "ความถี่เท่ากันเรียงตาม SKU"
                    : "ความถี่เท่ากันคงกลุ่มเดียวกัน"}{" "}
                  · {data.totalProducts} SKU ทั้งชุด
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground sm:hidden">
                  เลื่อนตารางแนวนอนเพื่อดูข้อมูลครบทุกคอลัมน์
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        {[
                          "เลือก",
                          "SKU / สินค้า",
                          "เอกสาร / สัดส่วนสะสม",
                          "เสนอ / ยืนยันเป็น",
                          "กลุ่มปัจจุบัน",
                          "รอบนับ / กำหนดถัดไป",
                        ].map((h) => (
                          <th key={h} className="p-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => {
                        const stale =
                          (item.profile?.confirmedAt || null) !==
                          item.previousConfirmedAt;
                        const value =
                          classes[item.productId] || item.recommendedClass;
                        return (
                          <tr key={item.productId} className="border-b">
                            <td className="p-3">
                              <label className="flex size-11 items-center justify-center">
                                <input
                                  className="size-5"
                                  type="checkbox"
                                  aria-label={`ยืนยันกลุ่ม ${item.sku}`}
                                  disabled={
                                    !canApprove || command.disabled || stale
                                  }
                                  checked={chosen.includes(item.productId)}
                                  onChange={(e) =>
                                    setChosen(
                                      e.target.checked
                                        ? [...chosen, item.productId]
                                        : chosen.filter(
                                            (x) => x !== item.productId,
                                          ),
                                    )
                                  }
                                />
                              </label>
                            </td>
                            <td className="p-3">
                              <p className="font-mono font-semibold">
                                {item.sku}
                              </p>
                              <p>{item.name}</p>
                              {stale && (
                                <p className="text-xs text-amber-800">
                                  กลุ่มยืนยันหลังผลชุดนี้แล้ว
                                  วิเคราะห์ใหม่หากต้องการเปลี่ยนอีก
                                </p>
                              )}
                            </td>
                            <td className="p-3">
                              {item.frequency} เอกสาร
                              <p className="text-xs text-muted-foreground">
                                สะสม {item.cumulativePercent.toFixed(2)}%
                              </p>
                            </td>
                            <td className="space-y-2 p-3">
                              <p className="text-xs">
                                เสนอ {item.recommendedClass}
                              </p>
                              <select
                                aria-label={`กลุ่มที่ยืนยัน ${item.sku}`}
                                className={selectClass}
                                disabled={
                                  !canApprove || command.disabled || stale
                                }
                                value={value}
                                onChange={(e) =>
                                  setClasses({
                                    ...classes,
                                    [item.productId]: e.target
                                      .value as ABCClass,
                                  })
                                }
                              >
                                {["A", "B", "C"].map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                              {value !== item.recommendedClass && (
                                <Input
                                  aria-label={`เหตุผลเลือกกลุ่ม ${item.sku}`}
                                  value={reasons[item.productId] || ""}
                                  placeholder="เหตุผลที่ต่างจากข้อเสนอ"
                                  disabled={command.disabled}
                                  onChange={(e) =>
                                    setReasons({
                                      ...reasons,
                                      [item.productId]: e.target.value,
                                    })
                                  }
                                />
                              )}
                            </td>
                            <td className="p-3">
                              <Badge variant="secondary">
                                {item.profile?.class || "ยังไม่ยืนยัน"}
                              </Badge>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {item.profile?.confirmedBy || ""}
                              </p>
                            </td>
                            <td className="p-3">
                              <p>
                                {item.cycleDays
                                  ? `${item.cycleDays} วัน`
                                  : "ยังไม่กำหนดรอบวัน"}
                              </p>
                              <p
                                className={
                                  item.dueDate && item.dueDate <= data.today
                                    ? "text-amber-800"
                                    : "text-muted-foreground"
                                }
                              >
                                {item.dueDate ||
                                  (item.profile?.lastCountedAt
                                    ? `นับล่าสุด ${new Date(item.profile.lastCountedAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })} · รอกำหนดกลุ่ม/รอบวัน`
                                    : "ยังไม่เคยตรวจนับที่อนุมัติ")}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    พบ {data.total} · หน้า {page} /{" "}
                    {Math.max(1, Math.ceil(data.total / data.pageSize))}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        page <= 1 || command.disabled || chosen.length > 0
                      }
                      onClick={() => setPage(page - 1)}
                    >
                      ก่อนหน้า
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        page * data.pageSize >= data.total ||
                        command.disabled ||
                        chosen.length > 0
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      ถัดไป
                    </Button>
                  </div>
                </div>
                {canApprove && (
                  <Button
                    disabled={!chosen.length || command.disabled}
                    onClick={() => {
                      command.setFeedback(null);
                      setConfirm(true);
                    }}
                  >
                    ทบทวนการยืนยัน {chosen.length} SKU
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  การยืนยันไม่เริ่มนับรอบใหม่
                  วันกำหนดอิงวันที่ตรวจนับล่าสุดที่อนุมัติแล้วและรอบวันของกลุ่ม
                  หากยังไม่มีวันตรวจนับ ให้จัดรอบแรกก่อน
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>ประวัติยืนยันกลุ่มล่าสุด 20 รายการ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.history.map((h) => (
                <div className="rounded-lg border p-3 text-sm" key={h.id}>
                  <p className="font-mono">
                    {h.product.sku} · {h.oldClass || "ยังไม่จัด"} → {h.newClass}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.confirmedBy} ·{" "}
                    {new Date(h.confirmedAt).toLocaleString("th-TH", {
                      timeZone: "Asia/Bangkok",
                    })}
                  </p>
                  {h.reason && <p>{h.reason}</p>}
                </div>
              ))}
              {!data.history.length && (
                <p className="text-sm text-muted-foreground">
                  ยังไม่มีการยืนยันกลุ่ม
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!command.disabled) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogTitle>ตั้งค่า ABC และรอบตรวจนับ</DialogTitle>
          <DialogDescription>
            การบันทึกนี้ไม่เปลี่ยนกลุ่มอัตโนมัติ
            รอบวันที่เปลี่ยนมีผลต่อกำหนดนับของกลุ่มที่ยืนยันแล้ว
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void command.send(
                "/api/abc",
                { action: "settings", ...config },
                () => {
                  setOpen(false);
                  setRefresh((v) => v + 1);
                  if (data) {
                    setFrom(
                      isoDay(
                        new Date(
                          new Date(`${data.today}T00:00:00+07:00`).getTime() -
                            (config.windowDays - 1) * 86400000,
                        ),
                      ),
                    );
                    setTo(data.today);
                  }
                  return {
                    kind: "success",
                    text: "บันทึกค่าแล้ว กลุ่มสินค้ายังไม่เปลี่ยน",
                  };
                },
              );
            }}
          >
            <fieldset disabled={command.disabled} className="space-y-4">
              {(
                [
                  ["windowDays", "ช่วงย้อนหลังเริ่มต้น (วัน)"],
                  ["thresholdA", "เส้นแบ่ง A (%)"],
                  ["thresholdB", "เส้นแบ่ง B (%)"],
                  ["daysA", "ตรวจนับ A ทุกกี่วัน"],
                  ["daysB", "ตรวจนับ B ทุกกี่วัน"],
                  ["daysC", "ตรวจนับ C ทุกกี่วัน"],
                ] as const
              ).map(([key, label]) => (
                <div className="field-group" key={key}>
                  <Label htmlFor={`abc-${key}`}>{label}</Label>
                  <Input
                    id={`abc-${key}`}
                    type="number"
                    min="1"
                    step="1"
                    value={config[key] ?? ""}
                    placeholder={
                      key.startsWith("days") ? "ยังไม่กำหนด" : undefined
                    }
                    onChange={(e) => configNumber(key, e.target.value)}
                  />
                </div>
              ))}
              <div className="field-group">
                <Label htmlFor="abc-tie">เมื่อความถี่เท่ากัน</Label>
                <select
                  id="abc-tie"
                  className={selectClass}
                  value={config.tieRule || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      tieRule: e.target.value as ABCConfig["tieRule"],
                    })
                  }
                >
                  <option value="" disabled>
                    เลือกกติกา
                  </option>
                  <option value="SKU_ORDER">เรียงตาม SKU</option>
                  <option value="KEEP_FREQUENCY_GROUP">
                    คง SKU ความถี่เท่ากันไว้กลุ่มเดียวกัน
                  </option>
                </select>
              </div>
              <Button className="w-full" type="submit">
                ยืนยันการตั้งค่า
              </Button>
            </fieldset>
            <CommandFeedback command={command} />
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!command.disabled) setConfirm(v);
        }}
      >
        <DialogContent>
          <DialogTitle>
            ยืนยันเปลี่ยนกลุ่มสินค้า {chosen.length} SKU
          </DialogTitle>
          <DialogDescription>
            เฉพาะ SKU ที่เลือกจะเปลี่ยนกลุ่ม
            การคำนวณรอบตรวจนับจะอิงกลุ่มที่ยืนยันและวันนับล่าสุด
          </DialogDescription>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {data?.items
              .filter((i) => chosen.includes(i.productId))
              .map((i) => (
                <p key={i.productId} className="text-sm">
                  {i.sku}: {i.profile?.class || "ยังไม่จัด"} →{" "}
                  {classes[i.productId] || i.recommendedClass}
                </p>
              ))}
          </div>
          <Button
            disabled={command.disabled}
            onClick={() =>
              void command.send(
                "/api/abc",
                {
                  action: "confirm",
                  runId: data?.run?.id,
                  changes: data?.items
                    .filter((i) => chosen.includes(i.productId))
                    .map((i) => ({
                      productId: i.productId,
                      class: classes[i.productId] || i.recommendedClass,
                      reason: reasons[i.productId] || undefined,
                    })),
                },
                (result) => {
                  setChosen([]);
                  setConfirm(false);
                  setRefresh((v) => v + 1);
                  return {
                    kind: "success",
                    text: `ยืนยันแล้ว ${result.confirmedCount} SKU`,
                  };
                },
              )
            }
          >
            ยืนยันกลุ่มตามรายการ
          </Button>
          <CommandFeedback command={command} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
