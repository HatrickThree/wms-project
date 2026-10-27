"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  LockKeyhole,
  Plus,
  RotateCcw,
  ScanLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  BusyLabel,
  EmptyState,
  Feedback,
  type FeedbackValue,
  PageHeader,
  Stepper,
} from "./common";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { InboundReceiveSchema } from "@/lib/validations/wms.schema";
import { ApiError, request } from "@/lib/wms";

const initial = {
  referenceDoc: "",
  locationBarcode: "",
  sku: "",
  lotNumber: "",
};
export function InboundScreen() {
  const [form, setForm] = useState(initial);
  const [serial, setSerial] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const dirty =
    serials.length > 0 ||
    !!serial.trim() ||
    (!saved && Object.values(form).some((value) => value.trim()));
  useUnsavedChanges(!!dirty);
  const payload = (items: string[]) => ({
    referenceDoc: form.referenceDoc.trim(),
    locationBarcode: form.locationBarcode.trim(),
    sku: form.sku.trim(),
    lotNumber: form.lotNumber.trim() || undefined,
    serialNumbers: items,
  });
  const validate = (items: string[]) => {
    const result = InboundReceiveSchema.safeParse(payload(items));
    if (!result.success) {
      const next: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        next[String(issue.path[0])] ||= issue.message;
      });
      setErrors(next);
      document.getElementById(`inbound-${Object.keys(next)[0]}`)?.focus();
      return false;
    }
    setErrors({});
    return true;
  };
  const addSerial = () => {
    if (busy || uncertain) return;
    const next = serial.trim();
    if (!validate([...serials, next])) return;
    if (serials.includes(next)) {
      setDuplicate(next);
      setFeedback({ kind: "error", text: `${next} อยู่ในรายการนี้แล้ว` });
      input.current?.select();
      return;
    }
    setSerials((previous) => [...previous, next]);
    setSerial("");
    setFeedback(null);
    setDuplicate(null);
    input.current?.focus();
  };
  const submit = async () => {
    if (pending.current || uncertain || !validate(serials)) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await request<{
        receivedCount: number;
        locationBarcode: string;
        referenceDoc?: string;
        newQtyOnHand: number;
      }>("/api/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(serials)),
      });
      setFeedback({
        kind: "success",
        text: `รับเข้าสำเร็จ ${result.receivedCount} ชิ้น ที่ ${result.locationBarcode} · เอกสาร ${form.referenceDoc.trim()} · ยอดที่ตำแหน่งนี้ ${result.newQtyOnHand} ชิ้น`,
      });
      setSerials([]);
      setSerial("");
      setSaved(true);
      setDuplicate(null);
      toast.success(`บันทึกรับเข้า ${result.receivedCount} ชิ้นแล้ว`);
      input.current?.focus();
    } catch (error) {
      if (error instanceof ApiError)
        setFeedback({
          kind: "error",
          text: `${error.message} · ยังไม่ได้รับเข้ารายการในรอบนี้`,
        });
      else {
        setUncertain(true);
        setFeedback({
          kind: "uncertain",
          text: "ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจประวัติ Serial และยอดล่าสุดก่อนทำรายการซ้ำ",
        });
      }
    } finally {
      pending.current = false;
      setBusy(false);
      setTimeout(() => input.current?.focus(), 0);
    }
  };
  const reset = () => {
    setForm(initial);
    setSerial("");
    setSerials([]);
    setErrors({});
    setFeedback(null);
    setSaved(false);
    setUncertain(false);
    setDuplicate(null);
  };
  const fields = [
    {
      key: "referenceDoc",
      label: "เลขที่ใบรับสินค้า",
      placeholder: "เช่น GRN-202610-002",
      optional: false,
    },
    {
      key: "locationBarcode",
      label: "ชั้นวางปลายทาง",
      placeholder: "สแกนรหัสชั้นวาง",
      optional: false,
    },
    {
      key: "sku",
      label: "รหัสสินค้า (SKU)",
      placeholder: "เช่น SCAN-PRO-X1",
      optional: false,
    },
    {
      key: "lotNumber",
      label: "Lot Number",
      placeholder: "ระบุ Lot ถ้ามี",
      optional: true,
    },
  ] as const;
  return (
    <div className="page-container max-w-[1240px]">
      <PageHeader
        eyebrow="OPERATIONS / INBOUND"
        title="รับสินค้าเข้า"
        description="ระบุข้อมูลรับเข้า สแกนสะสม Serial แล้วบันทึกเมื่อครบรายการ"
        action={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={
                  busy || uncertain ||
                  (!dirty && !Object.values(form).some((value) => value.trim()))
                }
              >
                <RotateCcw />
                เริ่มรอบใหม่
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>เริ่มรอบรับเข้าใหม่?</AlertDialogTitle>
              <AlertDialogDescription>
                ข้อมูลและ Serial ที่ยังไม่บันทึกในรอบนี้จะถูกล้าง
                โดยไม่มีผลกับรายการที่บันทึกแล้ว
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>ทำต่อรอบเดิม</AlertDialogCancel>
                <AlertDialogAction onClick={reset}>
                  ล้างและเริ่มใหม่
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />
      <Stepper
        steps={["ข้อมูลรับเข้า", "สแกน Serial", "ตรวจและบันทึก"]}
        current={busy ? 2 : serials.length ? 1 : 0}
      />
      <Feedback value={feedback}>
        {feedback?.kind === "success" && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/inventory?keyword=${encodeURIComponent(form.sku)}`}>
              ดูสต็อกที่บันทึก
              <ArrowRight />
            </Link>
          </Button>
        )}
        {uncertain && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                target="_blank"
                href={`/serials?sn=${encodeURIComponent(serials[0] || "")}`}
              >
                ตรวจประวัติ Serial ในแท็บใหม่
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setUncertain(false);
                setFeedback(null);
              }}
            >
              ตรวจผลแล้ว กลับไปทบทวน
            </Button>
          </div>
        )}
      </Feedback>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-xs text-primary">
                  01
                </span>
                ข้อมูลรับเข้า
              </CardTitle>
              <CardDescription>
                หนึ่งรอบรับเข้าใช้ SKU เดียวและชั้นวางเดียว
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-2">
                {fields.map(({ key, label, placeholder, optional }) => (
                  <div key={key} className="field-group">
                    <Label htmlFor={`inbound-${key}`}>
                      {label}
                      {optional ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          (ไม่บังคับ)
                        </span>
                      ) : (
                        <span className="ml-1 text-red-700" aria-hidden="true">
                          *
                        </span>
                      )}
                    </Label>
                    <Input
                      id={`inbound-${key}`}
                      value={form[key]}
                      onChange={(event) => {
                        setForm((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }));
                        setSaved(false);
                        setErrors((previous) => ({ ...previous, [key]: "" }));
                      }}
                      disabled={busy || uncertain || serials.length > 0}
                      placeholder={placeholder}
                      className="mono"
                      aria-required={!optional}
                      aria-invalid={!!errors[key]}
                      aria-describedby={
                        errors[key] ? `error-${key}` : undefined
                      }
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    {errors[key] && (
                      <p
                        id={`error-${key}`}
                        className="text-xs text-destructive"
                      >
                        {errors[key]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {serials.length > 0 && (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <LockKeyhole className="size-3.5 shrink-0" />
                  ข้อมูลรับเข้าถูกล็อกในรอบนี้ นำ Serial
                  ออกทั้งหมดหรือเริ่มรอบใหม่เพื่อเปลี่ยน
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-blue-50/40">
              <CardTitle className="flex items-center gap-2">
                <ScanLine className="size-5 text-primary" />
                สแกน Serial Number
              </CardTitle>
              <CardDescription>
                เพิ่มได้หลายชิ้นในรอบเดียว การสแกนยังไม่เปลี่ยนยอดสต็อก
              </CardDescription>
            </CardHeader>
            <CardContent className="!p-5 sm:!p-6">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addSerial();
                }}
              >
                <Label htmlFor="inbound-serialNumbers">Serial Number</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    ref={input}
                    id="inbound-serialNumbers"
                    value={serial}
                    onChange={(event) => {
                      setSerial(event.target.value);
                      setErrors((previous) => ({
                        ...previous,
                        serialNumbers: "",
                      }));
                    }}
                    disabled={busy || uncertain}
                    placeholder="สแกนหรือพิมพ์ S/N ที่นี่"
                    className="mono h-14 border-primary/50 text-base md:text-base"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={!!errors.serialNumbers}
                    aria-describedby="serial-scan-help serial-scan-error"
                  />
                  <Button
                    type="submit"
                    className="h-14 px-4"
                    disabled={busy || uncertain}
                  >
                    <Plus />
                    <span className="hidden sm:inline">เพิ่มรายการ</span>
                    <span className="sr-only sm:hidden">เพิ่ม Serial</span>
                  </Button>
                </div>
                <p
                  id="serial-scan-help"
                  className="mt-2 text-xs text-muted-foreground"
                >
                  กด Enter เพื่อเพิ่มรายการ · ต้องกดบันทึกเพื่อรับเข้าคลังจริง
                </p>
                {errors.serialNumbers && (
                  <p
                    id="serial-scan-error"
                    className="mt-2 text-xs text-destructive"
                  >
                    {errors.serialNumbers}
                  </p>
                )}
              </form>
              <div className="mt-6 flex items-center justify-between border-t pt-5">
                <h3 className="text-sm font-semibold">รายการในรอบนี้</h3>
                <Badge variant="secondary">
                  {serials.length} ชิ้น · ยังไม่บันทึก
                </Badge>
              </div>
              {serials.length ? (
                <ol className="mt-4 max-h-[460px] space-y-2 overflow-y-auto">
                  {[...serials].reverse().map((sn, index) => (
                    <li
                      key={sn}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${duplicate === sn ? "border-red-300 bg-red-50" : "bg-muted/20"}`}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <Check className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="mono break-all text-sm font-medium">
                          {sn}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          ลำดับ {serials.length - index} · ผ่านตรวจในรอบนี้
                          ยังไม่บันทึก
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy || uncertain}
                        aria-label={`นำ ${sn} ออกจากรายการ`}
                        onClick={() => {
                          setSerials((previous) =>
                            previous.filter((item) => item !== sn),
                          );
                          setDuplicate(null);
                        }}
                      >
                        <Trash2 className="text-slate-500" />
                      </Button>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  className="min-h-48 py-8"
                  title="พร้อมรับ Serial ชิ้นแรก"
                  description="กรอกข้อมูลรับเข้าให้ครบ แล้วสแกน S/N เพื่อเพิ่มลงในรายการ"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => input.current?.focus()}
                    >
                      <ScanLine />
                      พร้อมสแกน
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-primary" />
              สรุปรอบรับเข้า
            </CardTitle>
            <CardDescription>ตรวจข้อมูลก่อนบันทึกเข้าคลัง</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              {[
                ["เลขที่ใบรับ", form.referenceDoc || "ยังไม่ระบุ"],
                ["SKU", form.sku || "ยังไม่ระบุ"],
                ["ชั้นวาง", form.locationBarcode || "ยังไม่ระบุ"],
                ["Lot", form.lotNumber || "ไม่ระบุ"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mono mt-1 break-all text-sm font-medium">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="my-5 flex items-end justify-between rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">จำนวนรับเข้า</p>
              <p className="text-3xl font-semibold tabular-nums">
                {serials.length}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ชิ้น
                </span>
              </p>
            </div>
            <Button
              className="h-12 w-full"
              disabled={busy || uncertain || !serials.length || !!serial.trim()}
              onClick={submit}
            >
              {busy ? (
                <BusyLabel>กำลังบันทึก…</BusyLabel>
              ) : (
                <>
                  <ArrowDownToLine />
                  บันทึกรับเข้า {serials.length} ชิ้น
                </>
              )}
            </Button>
            {!!serial.trim() && (
              <p className="mt-3 text-xs text-amber-800">
                มี Serial ค้างในช่องสแกน กรุณาเพิ่มรายการหรือล้างช่องก่อนบันทึก
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {saved && !serials.length
                ? "บันทึกรอบล่าสุดแล้ว รับสินค้าต่อในเอกสารเดิมได้"
                : "รายการจะเข้าสต็อกเมื่อระบบยืนยันว่าบันทึกสำเร็จแล้วเท่านั้น"}
            </p>
            <div className="mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              ตรวจ Serial ซ้ำในรายการก่อน และตรวจข้อมูลในระบบอีกครั้งตอนบันทึก
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
