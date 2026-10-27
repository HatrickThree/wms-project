"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clipboard,
  Clock3,
  FileText,
  MapPin,
  Package,
  ScanLine,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  Feedback,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "./common";
import {
  currentLocation,
  movementLabels,
  request,
  type SerialDetail,
} from "@/lib/wms";
import { formatDate } from "@/lib/utils";

function SerialsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const sn = params.get("sn") || "";
  const [value, setValue] = useState(sn);
  const [data, setData] = useState<SerialDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue(sn);
    setData(null);
    setError(null);
    if (!sn.trim()) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    request<SerialDetail>(`/api/serials/${encodeURIComponent(sn)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "ค้นหาข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sn, refresh]);
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="WORKSPACE / TRACEABILITY"
        title="ประวัติ Serial"
        description="ติดตามสินค้าแต่ละชิ้น ตั้งแต่รับเข้าไปจนถึงจ่ายออกจากคลัง"
        action={
          <Button asChild variant="outline">
            <Link href="/inventory">
              ค้นหาด้วย SKU
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="!p-5 sm:!p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!value.trim()) {
                input.current?.focus();
                return;
              }
              if (value.trim() === sn) setRefresh((count) => count + 1);
              else
                router.push(`/serials?sn=${encodeURIComponent(value.trim())}`, {
                  scroll: false,
                });
            }}
          >
            <Label htmlFor="serial-lookup">Serial Number</Label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <ScanLine className="pointer-events-none absolute left-4 top-4 size-5 text-muted-foreground" />
                <Input
                  ref={input}
                  id="serial-lookup"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="mono h-14 pl-12 text-base"
                  placeholder="สแกนหรือพิมพ์ Serial Number"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
              <Button className="h-14 sm:px-7" disabled={loading}>
                <Search />
                {loading ? "กำลังค้นหา…" : "ค้นประวัติ"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              กรอกรหัสเต็ม แล้วกด Enter เพื่อค้นหา
            </p>
          </form>
        </CardContent>
      </Card>
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {loading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : data ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="flex min-w-0 gap-4">
                <span className="hidden size-14 shrink-0 items-center justify-center rounded-xl border bg-blue-50 text-primary sm:flex">
                  <Package className="size-7" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    หมายเลขเครื่อง
                  </p>
                  <h2 className="mono mt-1 break-all text-xl font-semibold">
                    {data.serialNumber}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.product.name}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge status={data.status} />
                    <Badge variant="secondary">
                      {data.product.category || "ทั่วไป"}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="คัดลอก Serial Number"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.serialNumber);
                    toast.success("คัดลอก S/N แล้ว");
                  } catch {
                    toast.error(
                      "คัดลอกไม่ได้ กรุณาเลือกและคัดลอกรหัสด้วยตนเอง",
                    );
                  }
                }}
              >
                <Clipboard />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="mb-6 h-px bg-border" />
              <div className="mb-6 flex items-center gap-2">
                <HistoryIcon />
                <h3 className="font-semibold">การเคลื่อนไหว</h3>
                <Badge variant="secondary" className="ml-auto">
                  {data.movements.length} รายการ
                </Badge>
              </div>
              <p className="mb-6 text-xs text-muted-foreground">
                เรียงจากรายการล่าสุด · เวลาไทย
              </p>
              {data.movements.length ? (
                <ol className="ml-4 border-l border-slate-200">
                  {data.movements.map((movement, index) => {
                    const transfer = ["INTERNAL_TRANSFER", "PUTAWAY"].includes(
                      movement.movementType,
                    );
                    const incoming = [
                      "INBOUND_RECEIVE",
                      "RETURN_IN",
                      "ADJUSTMENT_PLUS",
                    ].includes(movement.movementType);
                    const Icon = transfer
                      ? ArrowLeftRight
                      : incoming
                        ? ArrowDownToLine
                        : ArrowUpFromLine;
                    return (
                      <li
                        key={movement.id}
                        className="relative pb-7 pl-8 last:pb-0"
                      >
                        <span
                          className={`absolute -left-4 top-0 flex size-8 items-center justify-center rounded-full ring-4 ring-white ${incoming ? "bg-emerald-50 text-emerald-700" : transfer ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {movementLabels[movement.movementType] ||
                              movement.movementType}
                          </p>
                          {index === 0 && (
                            <Badge
                              variant="outline"
                              className="py-0.5 text-[10px]"
                            >
                              ล่าสุด
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(movement.createdAt, true)}
                        </p>
                        <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                          <p className="flex items-center gap-2">
                            <FileText className="size-3.5 text-muted-foreground" />
                            <span className="mono break-all">
                              {movement.referenceDoc}
                            </span>
                            <span className="ml-auto shrink-0 font-semibold">
                              {transfer ? "ย้าย " : incoming ? "+" : "−"}
                              {Math.abs(movement.qtyChange)}{" "}
                              {data.product.baseUom}
                            </span>
                          </p>
                          {movement.note && (
                            <p className="mt-2 break-words leading-relaxed text-muted-foreground">
                              {movement.note}
                            </p>
                          )}
                          <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                            <UserRound className="size-3.5" />
                            {movement.performedBy}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  title="ยังไม่มีประวัติการเคลื่อนไหว"
                  description="ยังไม่พบรายการเคลื่อนไหวที่บันทึกไว้สำหรับ Serial นี้"
                />
              )}
            </CardContent>
          </Card>
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>ข้อมูลสินค้า</CardTitle>
                <CardDescription>
                  สถานะปัจจุบันและเอกสารที่เกี่ยวข้อง
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y">
                  {[
                    ["รหัสสินค้า (SKU)", data.product.sku],
                    ["ตำแหน่งปัจจุบัน", currentLocation(data)],
                    ["Lot Number", data.lotNumber || "—"],
                    ["เอกสารรับเข้า", data.inboundDocNo],
                    ["รับเข้าเมื่อ", formatDate(data.receivedAt, true)],
                    ["เอกสารจ่ายออก", data.outboundDocNo || "—"],
                    [
                      "จ่ายออกเมื่อ",
                      data.shippedAt ? formatDate(data.shippedAt, true) : "—",
                    ],
                  ].map(([label, content]) => (
                    <div key={label} className="py-3 first:pt-0">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1.5 break-all text-sm font-medium">
                        {content}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link
                    href={`/inventory?keyword=${encodeURIComponent(data.product.sku)}`}
                  >
                    ดูสต็อกของ SKU นี้
                    <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-900">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <p>
                ประวัติช่วยตรวจสอบการเคลื่อนไหวย้อนหลัง
                ข้อมูลสถานะปัจจุบันอยู่ในการ์ดด้านบน
              </p>
            </div>
          </div>
        </div>
      ) : (
        !error && (
          <Card>
            <EmptyState
              title="ทุกชิ้นมีเรื่องราวให้ติดตาม"
              description="สแกนหรือกรอก Serial เพื่อดูข้อมูลสินค้า ตำแหน่งปัจจุบัน และประวัติการเคลื่อนไหว"
              action={
                <Button
                  variant="outline"
                  onClick={() => input.current?.focus()}
                >
                  <ScanLine />
                  พร้อมสแกน
                </Button>
              }
            />
          </Card>
        )
      )}
    </div>
  );
}
function HistoryIcon() {
  return <Clock3 className="size-4 text-muted-foreground" />;
}
export function SerialsScreen() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SerialsContent />
    </Suspense>
  );
}
