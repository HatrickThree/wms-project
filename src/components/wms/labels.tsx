"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  QrCode,
  Search,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Feedback, LoadingState, PageHeader } from "./common";
import {
  labelImageUrl,
  labelKinds,
  type LabelCatalog,
  type LabelFormat,
  type LabelItem,
  type LabelKind,
} from "@/lib/labels";
import { request } from "@/lib/wms";

export function LabelsScreen() {
  const [kind, setKind] = useState<LabelKind>("location");
  const [format, setFormat] = useState<LabelFormat>("qr");
  const [keyword, setKeyword] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [copies, setCopies] = useState(1);
  const [data, setData] = useState<LabelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LabelItem[]>([]);
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      kind,
      keyword: applied,
      page: String(page),
    });
    request<LabelCatalog>(`/api/labels/catalog?${query}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "โหลดข้อมูลไม่ได้",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, applied, page, refresh]);

  const labels = useMemo(
    () =>
      selected.flatMap((item) =>
        Array.from({ length: copies }, (_, index) => ({
          ...item,
          instance: `${kind}:${item.id}:${format}:${index}`,
        })),
      ),
    [selected, kind, format, copies],
  );
  const allReady =
    labels.length > 0 &&
    labels.every(
      (item) => ready.has(item.instance) && !failed.has(item.instance),
    );
  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;
  const toggle = (item: LabelItem) =>
    setSelected((previous) =>
      previous.some((entry) => entry.id === item.id)
        ? previous.filter((entry) => entry.id !== item.id)
        : previous.length < 60
          ? [...previous, item]
          : previous,
    );

  return (
    <div className="page-container">
      <div className="labels-controls">
        <PageHeader
          eyebrow="TOOLS / LABELS"
          title="ป้าย QR / บาร์โค้ด"
          description="สร้างป้ายชั้นวาง สินค้า และ Serial สำหรับงานคลังและสื่อฝึกปฏิบัติ โดยไม่เปลี่ยนยอดสต็อก"
          action={
            <Button onClick={() => window.print()} disabled={!allReady}>
              <Printer />
              พิมพ์ {labels.length} ป้าย
            </Button>
          }
        />
      </div>
      <div className="labels-controls grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>เลือกข้อมูลสำหรับป้าย</CardTitle>
            <CardDescription>
              เลือกได้สูงสุด 60 รายการต่อชุด
              รายการที่เลือกคงอยู่เมื่อเปลี่ยนหน้า
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                setApplied(keyword.trim());
                setPage(1);
                setRefresh((value) => value + 1);
              }}
            >
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as LabelKind);
                  setPage(1);
                  setSelected([]);
                  setKeyword("");
                  setApplied("");
                }}
              >
                <SelectTrigger
                  className="sm:w-48"
                  aria-label="ประเภทข้อมูลป้าย"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(labelKinds).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex min-w-0 flex-1 gap-2">
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  aria-label="ค้นหารหัสหรือชื่อสำหรับป้าย"
                  placeholder="ค้นหารหัสหรือชื่อ..."
                />
                <Button type="submit" variant="outline" className="h-12">
                  <Search />
                  <span className="sr-only">ค้นหา</span>
                </Button>
              </div>
            </form>
            {error ? (
              <Feedback value={{ kind: "error", text: error }} />
            ) : loading ? (
              <LoadingState />
            ) : data?.items.length ? (
              <div className="divide-y rounded-xl border">
                {data.items.map((item) => {
                  const checked = selected.some(
                    (entry) => entry.id === item.id,
                  );
                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/50 ${checked ? "bg-blue-50/50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-5 shrink-0 accent-blue-700"
                        checked={checked}
                        disabled={!checked && selected.length >= 60}
                        onChange={() => toggle(item)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="mono block break-all text-sm font-semibold">
                          {item.code}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      {checked && (
                        <Check className="size-4 shrink-0 text-primary" />
                      )}
                    </label>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="ไม่พบข้อมูลสำหรับป้าย"
                description="ลองเปลี่ยนประเภทหรือคำค้น ข้อมูลป้ายมาจากรายการที่มีอยู่ในระบบ"
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>
                หน้า {page} / {pageCount} · พบ {data?.total ?? "—"} รายการ
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft />
                  ก่อนหน้า
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  ถัดไป
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-4 text-primary" />
              ตั้งค่าป้าย
            </CardTitle>
            <CardDescription>
              ป้ายเป็นรหัสข้อความ ไม่ใช่ลิงก์เปิดหรือคำสั่งทำธุรกรรม
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="field-group">
              <Label htmlFor="label-format">รูปแบบรหัส</Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as LabelFormat)}
              >
                <SelectTrigger id="label-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qr">QR Code</SelectItem>
                  <SelectItem value="code128">Barcode — Code 128</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="field-group">
              <Label htmlFor="label-copies">จำนวนสำเนาต่อรายการ</Label>
              <Select
                value={String(copies)}
                onValueChange={(value) => setCopies(Number(value))}
              >
                <SelectTrigger id="label-copies">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 10].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count} ป้าย
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium">
                เลือก {selected.length} รายการ · รวม {labels.length} ป้าย
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {kind === "product"
                  ? "รหัสที่เข้ารหัสคือ SKU เพื่อใช้กับฟอร์มรับเข้า ส่วนรหัสผู้ผลิตยังค้นหาได้จากช่องค้นหา"
                  : kind === "location"
                    ? "รหัสที่เข้ารหัสคือบาร์โค้ดตำแหน่งจัดเก็บ"
                    : "รหัสที่เข้ารหัสคือ Serial Number"}
              </p>
            </div>
            {selected.length > 0 && (
              <>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {selected.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="mono min-w-0 flex-1 break-all">
                        {item.code}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`นำ ${item.code} ออกจากชุดป้าย`}
                        onClick={() => toggle(item)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelected([])}
                >
                  ล้างรายการที่เลือก
                </Button>
              </>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              งานพิมพ์จัดแบบ A4 ให้ตรวจตัวอย่างก่อนพิมพ์จริง
              และทดสอบการอ่านรหัสกับขนาดกระดาษ/เครื่องพิมพ์ที่ใช้
            </p>
          </CardContent>
        </Card>
      </div>
      <section className="space-y-4">
        <div className="labels-controls flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Tag className="size-4 text-muted-foreground" />
            ตัวอย่างป้าย
          </h2>
          <Badge variant="secondary">{labels.length} ป้าย</Badge>
        </div>
        {!labels.length ? (
          <Card className="labels-controls">
            <EmptyState
              title="เลือกข้อมูลเพื่อสร้างป้าย"
              description="เริ่มจากเลือกชั้นวางหรือสินค้า แล้วปรับรูปแบบและจำนวนสำเนาที่ต้องการ"
            />
          </Card>
        ) : (
          <>
            <div className="labels-controls">
              <Feedback
                value={{
                  kind: "uncertain",
                  text: "ภาพรหัสสร้างภายในระบบ ไม่ได้ส่งข้อมูลไปบริการสร้าง QR ภายนอก พิมพ์ได้เมื่อภาพทุกป้ายโหลดครบ",
                }}
              />
            </div>
            <div
              data-wms-label-sheet
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {labels.map((item) => (
                <article
                  key={item.instance}
                  className="wms-print-label flex flex-col items-center rounded-xl border bg-white p-5 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {labelKinds[kind]}
                  </p>
                  <img
                    src={labelImageUrl(kind, item.id, format)}
                    alt={`${format === "qr" ? "QR Code" : "Barcode"} ${item.code}`}
                    className={
                      format === "qr"
                        ? "my-3 size-36 object-contain"
                        : "my-3 h-28 w-full object-contain"
                    }
                    onLoad={() => {
                      setReady((previous) =>
                        new Set(previous).add(item.instance),
                      );
                      setFailed((previous) => {
                        const next = new Set(previous);
                        next.delete(item.instance);
                        return next;
                      });
                    }}
                    onError={() =>
                      setFailed((previous) =>
                        new Set(previous).add(item.instance),
                      )
                    }
                  />
                  <p className="mono break-all text-base font-semibold">
                    {item.code}
                  </p>
                  <p className="mt-1 text-xs">{item.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {item.description}
                  </p>
                  {failed.has(item.instance) && (
                    <p className="labels-controls mt-3 text-xs text-destructive">
                      สร้างภาพไม่ได้ รหัสอาจไม่รองรับ Code 128 ลองเปลี่ยนเป็น QR
                      Code
                    </p>
                  )}
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="labels-controls mt-3"
                  >
                    <a
                      href={labelImageUrl(kind, item.id, format, true)}
                      download
                    >
                      <Download />
                      ดาวน์โหลดภาพ
                    </a>
                  </Button>
                </article>
              ))}
            </div>
            <div className="labels-controls flex justify-end">
              <Button disabled={!allReady} onClick={() => window.print()}>
                <Printer />
                {allReady
                  ? `พิมพ์ ${labels.length} ป้าย`
                  : "กำลังเตรียมภาพป้าย…"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
