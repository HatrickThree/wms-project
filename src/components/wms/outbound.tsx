"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Info,
  MapPin,
  Package,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  StatusBadge,
  Stepper,
} from "./common";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { OutboundPickSchema } from "@/lib/validations/wms.schema";
import { ScanInput } from "./scan-input";
import { ApiError, request, type SerialDetail } from "@/lib/wms";
import { formatDate } from "@/lib/utils";

interface PickResult {
  serialNumber: string;
  sku: string;
  productName: string;
  pickedFromLocation: string;
  outboundDocNo: string;
  status: string;
}
export function OutboundScreen() {
  const [form, setForm] = useState({
    outboundDocNo: "",
    locationBarcode: "",
    serialNumber: "",
  });
  const [reviewed, setReviewed] = useState<SerialDetail | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null);
  const [working, setWorking] = useState<"checking" | "posting" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [allocationChecked, setAllocationChecked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<(PickResult & { time: Date })[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const checking = useRef(false);
  useUnsavedChanges(
    !!(
      form.serialNumber.trim() ||
      reviewed ||
      working ||
      (!saved && (form.outboundDocNo.trim() || form.locationBarcode.trim()))
    ),
  );
  const payload = () => ({
    outboundDocNo: form.outboundDocNo.trim(),
    locationBarcode: form.locationBarcode.trim(),
    serialNumber: form.serialNumber.trim(),
  });
  const update = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setReviewed(null);
    setAllocationChecked(false);
    setFeedback(null);
    setSaved(false);
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };
  const lookup = async () => {
    if (checking.current || pending.current || uncertain) return;
    const parsed = OutboundPickSchema.safeParse(payload());
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        next[String(issue.path[0])] ||= issue.message;
      });
      setErrors(next);
      document.getElementById(`outbound-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    checking.current = true;
    setWorking("checking");
    setReviewed(null);
    setFeedback(null);
    setErrors({});
    setAllocationChecked(false);
    try {
      const result = await request<SerialDetail>(
        `/api/serials/${encodeURIComponent(parsed.data.serialNumber)}`,
      );
      if (!["IN_STOCK", "ALLOCATED"].includes(result.status))
        throw new ApiError(
          "Serial นี้ไม่อยู่ในสถานะที่จ่ายออกได้ กรุณาตรวจสอบประวัติ",
        );
      if (
        !result.location ||
        result.location.barcode !== parsed.data.locationBarcode
      )
        throw new ApiError(
          `ชั้นวางไม่ตรงกัน Serial นี้อยู่ที่ ${result.location?.barcode || "ไม่ระบุตำแหน่ง"} กรุณาสแกนชั้นวางใหม่`,
        );
      if (result.location.type === "QUARANTINE")
        throw new ApiError(
          "สินค้าอยู่ในพื้นที่กักกัน กรุณาตรวจสอบสถานะก่อนจ่ายออก",
        );
      setReviewed(result);
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "ตรวจสอบข้อมูลไม่สำเร็จ กรุณาลองใหม่",
      });
    } finally {
      checking.current = false;
      setWorking(null);
    }
  };
  const submit = async () => {
    if (
      pending.current ||
      !reviewed ||
      uncertain ||
      (reviewed.status === "ALLOCATED" && !allocationChecked)
    )
      return;
    pending.current = true;
    setWorking("posting");
    setFeedback(null);
    try {
      const result = await request<PickResult>("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      setRecent((previous) => [{ ...result, time: new Date() }, ...previous]);
      setForm((previous) => ({ ...previous, serialNumber: "" }));
      setReviewed(null);
      setSaved(true);
      setAllocationChecked(false);
      setFeedback({
        kind: "success",
        text: `จ่ายออกสำเร็จ ${result.serialNumber} · เอกสาร ${result.outboundDocNo} · สินค้าถูกตัดออกจากคลังแล้ว`,
      });
      toast.success("บันทึกจ่ายออก 1 ชิ้นแล้ว");
    } catch (error) {
      if (error instanceof ApiError) {
        setFeedback({ kind: "error", text: error.message });
        setReviewed(null);
      } else {
        setUncertain(true);
        setFeedback({
          kind: "uncertain",
          text: "ยังยืนยันผลการจ่ายออกไม่ได้ ตรวจประวัติ Serial ล่าสุดก่อนทำรายการซ้ำ",
        });
      }
    } finally {
      pending.current = false;
      setWorking(null);
      setConfirmOpen(false);
      setTimeout(() => input.current?.focus(), 0);
    }
  };
  return (
    <div className="page-container max-w-[1240px]">
      <PageHeader
        eyebrow="OPERATIONS / OUTBOUND"
        title="จ่ายสินค้าออก"
        description="ตรวจชั้นวางและ Serial ให้ตรงกัน แล้วทบทวนก่อนยืนยันจ่ายออกทีละชิ้น"
        action={
          <Button asChild variant="outline">
            <Link href="/serials">
              ตรวจประวัติ Serial
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      <Stepper
        steps={["เอกสารและชั้นวาง", "ตรวจสอบ Serial", "ยืนยันจ่ายออก"]}
        current={
          confirmOpen || working === "posting"
            ? 2
            : form.locationBarcode && form.outboundDocNo
              ? 1
              : 0
        }
      />
      <Feedback value={feedback}>
        {uncertain && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                target="_blank"
                href={`/serials?sn=${encodeURIComponent(form.serialNumber)}`}
              >
                ตรวจประวัติในแท็บใหม่
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setUncertain(false);
                setReviewed(null);
                setFeedback(null);
              }}
            >
              ตรวจผลแล้ว กลับไปทบทวน
            </Button>
          </div>
        )}
      </Feedback>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                ข้อมูลการจ่ายออก
              </CardTitle>
              <CardDescription>
                ระบุเอกสารและตำแหน่งที่หยิบสินค้าจริง
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  lookup();
                }}
                className="space-y-5"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  {(
                    [
                      {
                        key: "outboundDocNo",
                        label: "เลขที่ใบเบิก / เอกสารจ่าย",
                        placeholder: "เช่น SO-202610-001",
                      },
                      {
                        key: "locationBarcode",
                        label: "ชั้นวางต้นทาง",
                        placeholder: "สแกนรหัสชั้นวาง",
                      },
                    ] as const
                  ).map(({ key, label, placeholder }) => (
                    <div key={key} className="field-group">
                      <Label htmlFor={`outbound-${key}`}>
                        {label}{" "}
                        <span className="text-red-700" aria-hidden="true">
                          *
                        </span>
                      </Label>
                      <ScanInput
                        scannerEnabled={key === "locationBarcode"}
                        scannerTitle="สแกนชั้นวางต้นทาง"
                        onScanValue={(value) => update(key, value)}
                        id={`outbound-${key}`}
                        value={form[key]}
                        onChange={(event) => update(key, event.target.value)}
                        className="mono"
                        placeholder={placeholder}
                        disabled={!!working || uncertain}
                        aria-required="true"
                        aria-invalid={!!errors[key]}
                        aria-describedby={
                          errors[key] ? `outbound-error-${key}` : undefined
                        }
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                      {errors[key] && (
                        <p
                          id={`outbound-error-${key}`}
                          className="text-xs text-destructive"
                        >
                          {errors[key]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 sm:p-5">
                  <Label
                    htmlFor="outbound-serialNumber"
                    className="flex items-center gap-2"
                  >
                    <ScanLine className="size-4 text-primary" />
                    Serial Number
                  </Label>
                  <ScanInput
                    scannerTitle="สแกน Serial สำหรับจ่ายออก"
                    onScanValue={(value) => update("serialNumber", value)}
                    id="outbound-serialNumber"
                    ref={input}
                    value={form.serialNumber}
                    onChange={(event) =>
                      update("serialNumber", event.target.value)
                    }
                    placeholder="สแกน Serial บนตัวสินค้า"
                    className="mono mt-3 h-14 border-primary/40 text-base md:text-base"
                    disabled={!!working || uncertain}
                    aria-invalid={!!errors.serialNumber}
                    aria-describedby="outbound-serial-help outbound-error-serialNumber"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <p
                    id="outbound-serial-help"
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    กด Enter เพื่อตรวจสอบข้อมูล ยังไม่ตัดสต็อก
                  </p>
                  {errors.serialNumber && (
                    <p
                      id="outbound-error-serialNumber"
                      className="mt-2 text-xs text-destructive"
                    >
                      {errors.serialNumber}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="mt-4 h-12 w-full sm:w-auto"
                    disabled={!!working || uncertain}
                  >
                    {working === "checking" ? (
                      <BusyLabel>กำลังตรวจสอบ…</BusyLabel>
                    ) : (
                      <>
                        <ShieldCheck />
                        ตรวจสอบ Serial
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-muted-foreground" />
                ผลการตรวจสอบ
              </CardTitle>
              <CardDescription>
                ข้อมูลที่อ่านได้ยังไม่ใช่การจองสินค้า ระบบจะตรวจซ้ำขณะจ่ายออก
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reviewed ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-emerald-900">
                        Serial และชั้นวางตรงกัน
                      </p>
                      <p className="mono mt-1 break-all text-sm">
                        {reviewed.serialNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reviewed.product.name}
                      </p>
                    </div>
                    <StatusBadge status={reviewed.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ["SKU", reviewed.product.sku],
                      ["ชั้นวาง", reviewed.location?.barcode || "—"],
                      ["Lot", reviewed.lotNumber || "—"],
                      ["เลขที่ใบเบิก", form.outboundDocNo],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mono mt-1 break-all font-medium">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {reviewed.status === "ALLOCATED" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      <p className="leading-relaxed">
                        สินค้านี้มีสถานะจองแล้ว
                        กรุณาตรวจเอกสารการจองกับใบเบิกก่อนยืนยัน
                        ระบบปัจจุบันยังไม่ตรวจเจ้าของการจองอัตโนมัติ
                      </p>
                      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-5 accent-blue-700"
                          checked={allocationChecked}
                          onChange={(event) =>
                            setAllocationChecked(event.target.checked)
                          }
                          disabled={!!working || uncertain}
                        />
                        ตรวจสอบเอกสารการจองแล้ว
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  className="min-h-44 py-7"
                  title="รอตรวจสอบสินค้า"
                  description="สแกนชั้นวางและ Serial แล้วกดตรวจสอบ เพื่อดูข้อมูลก่อนจ่ายออก"
                />
              )}
            </CardContent>
          </Card>
          {recent.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>จ่ายออกแล้วในรอบนี้</CardTitle>
                  <CardDescription className="mt-1">
                    เฉพาะรายการที่ยืนยันสำเร็จบนหน้าจอนี้
                  </CardDescription>
                </div>
                <Badge variant="success">{recent.length} ชิ้น</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {recent.map((item) => (
                  <div
                    key={`${item.serialNumber}-${item.time.getTime()}`}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
                    <div className="min-w-0 flex-1">
                      <p className="mono break-all text-xs font-medium">
                        {item.serialNumber}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.outboundDocNo} · {formatDate(item.time, true)}
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        href={`/serials?sn=${encodeURIComponent(item.serialNumber)}`}
                        aria-label={`ดูประวัติ ${item.serialNumber}`}
                      >
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle>สรุปการจ่ายออก</CardTitle>
            <CardDescription>ตรวจสอบให้ครบก่อนยืนยัน</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {[
                ["เอกสารจ่ายออก", form.outboundDocNo || "ยังไม่ระบุ", FileText],
                ["ชั้นวางต้นทาง", form.locationBarcode || "ยังไม่ระบุ", MapPin],
                ["Serial Number", form.serialNumber || "ยังไม่สแกน", ScanLine],
              ].map(([label, value, Icon]) => {
                const ItemIcon = Icon as typeof FileText;
                return (
                  <div key={String(label)} className="flex gap-3">
                    <ItemIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {String(label)}
                      </p>
                      <p className="mono mt-1 break-all text-sm font-medium">
                        {String(value)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="my-5 flex items-end justify-between rounded-lg border bg-muted/40 p-4">
              <span className="text-sm text-muted-foreground">
                จำนวนจ่ายออก
              </span>
              <p className="text-3xl font-semibold">
                {reviewed ? 1 : 0}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ชิ้น
                </span>
              </p>
            </div>
            <Button
              className="h-12 w-full"
              disabled={
                !reviewed ||
                !!working ||
                uncertain ||
                (reviewed.status === "ALLOCATED" && !allocationChecked)
              }
              onClick={() => setConfirmOpen(true)}
            >
              <ArrowUpFromLine />
              ตรวจและยืนยันจ่ายออก
            </Button>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              เมื่อยืนยัน สินค้าจะถูกตัดออกจากคลังและเปลี่ยนเป็น “จ่ายออกแล้ว”
              ทันที
            </p>
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!pending.current) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>ยืนยันจ่ายออก 1 ชิ้น?</AlertDialogTitle>
          <AlertDialogDescription>
            สินค้าจะถูกตัดออกจากตำแหน่งและเปลี่ยนสถานะเป็น “จ่ายออกแล้ว”
            กรุณาตรวจรายละเอียดก่อนยืนยัน
          </AlertDialogDescription>
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="mono break-all font-semibold">
              {reviewed?.serialNumber}
            </p>
            <p className="text-muted-foreground">{reviewed?.product.sku}</p>
            <p>
              จากชั้นวาง <span className="mono">{form.locationBarcode}</span>
            </p>
            <p>
              เอกสาร <span className="mono">{form.outboundDocNo}</span>
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working === "posting"}>
              กลับไปตรวจสอบ
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={working === "posting"}
              onClick={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {working === "posting" ? (
                <BusyLabel>กำลังจ่ายออก…</BusyLabel>
              ) : (
                <>
                  <ArrowUpFromLine />
                  ยืนยันจ่ายออก
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
