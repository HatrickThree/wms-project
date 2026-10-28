"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, PackageCheck, RefreshCw } from "lucide-react";
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
import {
  PageHeader,
  Feedback,
  LoadingState,
  EmptyState,
  type FeedbackValue,
} from "./common";
import { ScanInput } from "./scan-input";
import { ApiError, request } from "@/lib/wms";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import type {
  CatalogProduct,
  StockOrderRow,
  StockAllocationRow,
  StockData,
} from "@/lib/stock-types";

const statusLabels = {
  DRAFT: "ฉบับร่าง",
  RESERVED: "จองแล้ว · รอหยิบ",
  PICKED: "หยิบครบ · รอยืนยันจ่าย",
  SHIPPED: "จ่ายออกแล้ว",
  CANCELLED: "ยกเลิก",
};
type Command = {
  path: string;
  body: Record<string, unknown>;
  key: string;
  create?: boolean;
};
export function OrdersScreen({ canApprove }: { canApprove: boolean }) {
  const [data, setData] = useState<{
    orders: StockOrderRow[];
    count: number;
    limit: number;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null);
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [unitId, setUnitId] = useState("");
  const [lines, setLines] = useState<
    { product: CatalogProduct; quantity: number; unitId: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const lastCommand = useRef<Command | null>(null);
  const [pick, setPick] = useState<StockAllocationRow | null>(null);
  const [pickForm, setPickForm] = useState({
    locationBarcode: "",
    serialNumber: "",
    quantity: 1,
  });
  const [confirm, setConfirm] = useState<"ship" | "cancel" | null>(null);
  const [override, setOverride] = useState(false);
  const [stock, setStock] = useState<StockData | null>(null);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const order = data?.orders.find((o) => o.id === selected) || null;
  useUnsavedChanges(
    !!number || lines.length > 0 || uncertain || !!pick || override,
  );
  useEffect(() => {
    let active = true;
    request<{ orders: StockOrderRow[]; count: number; limit: number }>(
      "/api/orders",
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setFeedback({ kind: "error", text: e.message });
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const run = async (command: Command) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    lastCommand.current = command;
    try {
      const result = await request<StockOrderRow>(command.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command.body, operationId: command.key }),
      });
      setUncertain(false);
      setSelected(result.id);
      setPick(null);
      setConfirm(null);
      setOverride(false);
      setRefresh((v) => v + 1);
      if (command.create) {
        setNumber("");
        setLines([]);
      }
      setFeedback({
        kind: "success",
        text: `${result.number} · ${statusLabels[result.status]}`,
      });
      lastCommand.current = null;
    } catch (e) {
      const unknown = !(e instanceof ApiError) || (e.status || 500) >= 500;
      setUncertain(unknown);
      setFeedback({
        kind: unknown ? "uncertain" : "error",
        text: unknown
          ? "ยังยืนยันผลไม่ได้ ใช้ปุ่มตรวจผลรายการเดิมก่อนทำงานอื่น เพื่อไม่ส่งคำสั่งซ้ำ"
          : e.message,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const action = (body: Record<string, unknown>) => {
    if (order)
      void run({
        path: `/api/orders/${order.id}`,
        body,
        key: crypto.randomUUID(),
      });
  };
  const find = async (value = code) => {
    if (lookup) return;
    setLookup(true);
    try {
      const p = await request<CatalogProduct>(
        `/api/scan/product?code=${encodeURIComponent(value.trim())}`,
      );
      setProduct(p);
      setCode(p.sku);
      setUnitId("");
    } catch (e) {
      setFeedback({
        kind: "error",
        text: e instanceof Error ? e.message : "ไม่พบสินค้า",
      });
      throw e;
    } finally {
      setLookup(false);
    }
  };
  const openOverride = async () => {
    setPreferred([]);
    setReason("");
    setOverride(true);
    setStock(null);
    try {
      setStock(await request<StockData>("/api/stock"));
    } catch (e) {
      setFeedback({
        kind: "error",
        text: e instanceof Error ? e.message : "โหลดสต็อกไม่ได้",
      });
    }
  };
  const disabled = busy || uncertain;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS / ORDERS"
        title="คำสั่งซื้อและจ่ายออก"
        description="สร้างคำสั่งซื้อ → จองตาม FIFO/FEFO → ตรวจหยิบ → ยืนยันจ่ายออก ยอดถือครองจะลดเมื่อยืนยันจ่ายเท่านั้น"
        action={
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            <RefreshCw />
            โหลดข้อมูลใหม่
          </Button>
        }
      />
      {feedback && <Feedback value={feedback} />}{" "}
      {uncertain && (
        <Button
          disabled={busy}
          onClick={() => lastCommand.current && void run(lastCommand.current)}
        >
          ตรวจผลรายการเดิม
        </Button>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>สร้างคำสั่งซื้อ</CardTitle>
            </CardHeader>
            <CardContent>
              <fieldset disabled={disabled} className="space-y-4">
                <div className="field-group">
                  <Label htmlFor="order-number">
                    เลขที่คำสั่งซื้อ / ใบเบิก
                  </Label>
                  <Input
                    id="order-number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <Label htmlFor="order-product">SKU / บาร์โค้ดสินค้า</Label>
                  <ScanInput
                    id="order-product"
                    scannerTitle="สแกนสินค้าในคำสั่งซื้อ"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setProduct(null);
                    }}
                    onScanValue={find}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void find().catch(() => {});
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lookup}
                    onClick={() => void find().catch(() => {})}
                  >
                    {lookup ? "กำลังค้นหา…" : "ตรวจสินค้า"}
                  </Button>
                </div>
                {product && (
                  <>
                    <p className="text-sm font-medium">{product.name}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="field-group">
                        <Label htmlFor="order-qty">จำนวน</Label>
                        <Input
                          id="order-qty"
                          type="number"
                          min="1"
                          step="1"
                          value={qty}
                          onChange={(e) => setQty(Number(e.target.value))}
                        />
                      </div>
                      <div className="field-group">
                        <Label htmlFor="order-unit">หน่วย</Label>
                        <select
                          id="order-unit"
                          className="h-12 rounded-lg border bg-background px-3 text-sm"
                          value={unitId}
                          onChange={(e) => setUnitId(e.target.value)}
                        >
                          <option value="">{product.baseUom}</option>
                          {product.units?.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} × {u.factor}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (!Number.isInteger(qty) || qty < 1) {
                          setFeedback({
                            kind: "error",
                            text: "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0",
                          });
                          return;
                        }
                        if (lines.some((l) => l.product.id === product.id)) {
                          setFeedback({
                            kind: "error",
                            text: "SKU นี้อยู่ในคำสั่งซื้อแล้ว นำรายการเดิมออกก่อนปรับจำนวน",
                          });
                          return;
                        }
                        setLines([
                          ...lines,
                          { product, quantity: qty, unitId },
                        ]);
                        setProduct(null);
                        setCode("");
                        setQty(1);
                        setUnitId("");
                      }}
                    >
                      <Plus />
                      เพิ่มบรรทัด
                    </Button>
                  </>
                )}
                <div className="space-y-2">
                  {lines.map((l) => (
                    <div
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      key={l.product.id}
                    >
                      <div>
                        <p className="font-mono">{l.product.sku}</p>
                        <p>
                          {l.quantity}{" "}
                          {l.product.units?.find((u) => u.id === l.unitId)
                            ?.name || l.product.baseUom}{" "}
                          ={" "}
                          {l.quantity *
                            (l.product.units?.find((u) => u.id === l.unitId)
                              ?.factor || 1)}{" "}
                          {l.product.baseUom}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`นำ ${l.product.sku} ออกจากคำสั่งซื้อ`}
                        onClick={() =>
                          setLines(
                            lines.filter((x) => x.product.id !== l.product.id),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  disabled={!number.trim() || !lines.length || lookup}
                  className="w-full"
                  onClick={() =>
                    void run({
                      path: "/api/orders",
                      key: crypto.randomUUID(),
                      create: true,
                      body: {
                        number: number.trim(),
                        lines: lines.map((l) => ({
                          productId: l.product.id,
                          quantity: l.quantity,
                          unitId: l.unitId || undefined,
                        })),
                      },
                    })
                  }
                >
                  บันทึกฉบับร่าง
                </Button>
                <p className="text-xs text-muted-foreground">
                  ฉบับร่างยังไม่จองหรือตัดสต็อก อัตราแปลงหน่วยจะเก็บไว้กับเอกสาร
                </p>
              </fieldset>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>คำสั่งซื้อล่าสุด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!data ? (
                <LoadingState />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    ทั้งหมด {data.count} · แสดงล่าสุดไม่เกิน {data.limit} รายการ
                  </p>
                  {data.orders.map((o) => (
                    <button
                      key={o.id}
                      disabled={disabled}
                      onClick={() => setSelected(o.id)}
                      className={`w-full rounded-xl border p-3 text-left text-sm ${selected === o.id ? "border-blue-500 bg-blue-50" : "hover:bg-muted"}`}
                    >
                      <p className="break-all font-mono font-semibold">
                        {o.number}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {statusLabels[o.status]} · {o.lines.length} SKU
                      </p>
                    </button>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
        {!order ? (
          <Card>
            <CardContent>
              <EmptyState
                title="เลือกคำสั่งซื้อ"
                description="สร้างฉบับร่างหรือเลือกคำสั่งซื้อด้านซ้าย เพื่อจองและตรวจหยิบ"
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="font-mono">{order.number}</CardTitle>
                <Badge
                  variant={order.status === "SHIPPED" ? "success" : "secondary"}
                >
                  {statusLabels[order.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                สร้างโดย {order.createdBy} ·{" "}
                {new Date(order.createdAt).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {order.lines.map((line) => (
                <section
                  key={line.id}
                  className="space-y-3 rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono font-semibold">
                        {line.product.sku}
                      </p>
                      <p className="text-sm">{line.product.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {line.quantity} {line.product.baseUom}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {line.requestedQuantity} {line.requestedUom} ×{" "}
                        {line.conversionFactor}
                      </p>
                      <Badge variant="outline">
                        {line.product.issuePolicy}
                      </Badge>
                    </div>
                  </div>
                  {line.allocations.map((a) => (
                    <div
                      key={a.id}
                      className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm"
                    >
                      <p className="font-mono">
                        {a.stockLayer.location.barcode} · {a.quantity}{" "}
                        {line.product.baseUom}
                      </p>
                      <p>
                        Lot {a.stockLayer.lot?.number || "—"} · หมดอายุ{" "}
                        {a.stockLayer.lot?.expiresOn || "ไม่ระบุ"}
                      </p>
                      {a.serialItem && (
                        <p className="font-mono">
                          S/N {a.serialItem.serialNumber}
                        </p>
                      )}
                      {a.overrideReason && (
                        <p className="text-xs text-amber-800">
                          ข้ามลำดับ: {a.overrideReason} · {a.overrideBy}
                        </p>
                      )}
                      {a.pickedAt ? (
                        <p className="text-xs text-emerald-700">
                          ตรวจหยิบแล้ว · {a.pickedBy}
                        </p>
                      ) : (
                        order.status === "RESERVED" && (
                          <Button
                            variant="outline"
                            disabled={disabled}
                            onClick={() => {
                              setPick(a);
                              setPickForm({
                                locationBarcode: "",
                                serialNumber: "",
                                quantity: a.quantity,
                              });
                            }}
                          >
                            ตรวจหยิบรายการนี้
                          </Button>
                        )
                      )}
                    </div>
                  ))}
                </section>
              ))}
              <div className="flex flex-wrap gap-3">
                {order.status === "DRAFT" && (
                  <>
                    <Button
                      disabled={disabled}
                      onClick={() => action({ action: "reserve" })}
                    >
                      จองตาม FIFO / FEFO
                    </Button>
                    {canApprove && (
                      <Button
                        variant="outline"
                        disabled={disabled}
                        onClick={() => void openOverride()}
                      >
                        เลือกข้อยกเว้นพร้อมเหตุผล
                      </Button>
                    )}
                  </>
                )}
                {order.status === "PICKED" && (
                  <Button
                    disabled={disabled}
                    onClick={() => setConfirm("ship")}
                  >
                    <PackageCheck />
                    ทบทวนและยืนยันจ่ายออก
                  </Button>
                )}
                {["DRAFT", "RESERVED"].includes(order.status) &&
                  !order.lines.some((l) =>
                    l.allocations.some((a) => a.pickedAt),
                  ) && (
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => setConfirm("cancel")}
                    >
                      ยกเลิกคำสั่งซื้อ
                    </Button>
                  )}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                จองและหยิบยังคงยอดถือครองไว้ ·
                สินค้าหมดอายุและพื้นที่กักกันห้ามจ่าย · ยกเลิกได้ก่อนเริ่มหยิบ
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <Dialog
        open={!!pick}
        onOpenChange={(v) => {
          if (!v && !disabled) setPick(null);
        }}
      >
        <DialogContent>
          <DialogTitle>ตรวจหยิบสินค้า</DialogTitle>
          <DialogDescription>
            สแกนตำแหน่งและ Serial ที่จอง แล้วตรวจจำนวนก่อนยืนยัน
            ยังไม่ตัดยอดถือครอง
          </DialogDescription>
          {pick && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                action({
                  action: "pick",
                  allocationId: pick.id,
                  ...pickForm,
                  serialNumber: pickForm.serialNumber || undefined,
                });
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.target as HTMLElement).tagName !== "BUTTON"
                )
                  e.preventDefault();
              }}
            >
              <fieldset disabled={disabled} className="space-y-4">
                <p className="text-sm">
                  ต้องหยิบ {pick.quantity} หน่วยหลัก ·{" "}
                  {pick.stockLayer.location.barcode}
                </p>
                <div className="field-group">
                  <Label htmlFor="pick-location">ชั้นวางที่หยิบ</Label>
                  <ScanInput
                    id="pick-location"
                    scannerTitle="สแกนชั้นวางหยิบ"
                    value={pickForm.locationBarcode}
                    onChange={(e) =>
                      setPickForm({
                        ...pickForm,
                        locationBarcode: e.target.value,
                      })
                    }
                    onScanValue={(v) =>
                      setPickForm((f) => ({ ...f, locationBarcode: v }))
                    }
                  />
                </div>
                {pick.serialItem && (
                  <div className="field-group">
                    <Label htmlFor="pick-serial">Serial ที่หยิบ</Label>
                    <ScanInput
                      id="pick-serial"
                      scannerTitle="สแกน Serial หยิบ"
                      value={pickForm.serialNumber}
                      onChange={(e) =>
                        setPickForm({
                          ...pickForm,
                          serialNumber: e.target.value,
                        })
                      }
                      onScanValue={(v) =>
                        setPickForm((f) => ({ ...f, serialNumber: v }))
                      }
                    />
                  </div>
                )}
                <div className="field-group">
                  <Label htmlFor="pick-quantity">จำนวนหน่วยหลักที่หยิบ</Label>
                  <Input
                    id="pick-quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={pickForm.quantity}
                    onChange={(e) =>
                      setPickForm({
                        ...pickForm,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <Button type="submit" className="w-full">
                  {busy ? "กำลังตรวจ…" : "ยืนยันตรวจหยิบ"}
                </Button>
              </fieldset>
              {feedback?.kind === "error" && <Feedback value={feedback} />}
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v && !disabled) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {confirm === "ship" ? "ยืนยันจ่ายออกจากคลัง" : "ยกเลิกคำสั่งซื้อ"}
          </DialogTitle>
          <DialogDescription>
            {confirm === "ship"
              ? "เมื่อยืนยัน ระบบจะลดทั้งยอดถือครองและยอดจอง พร้อมบันทึกประวัติการจ่าย"
              : "ระบบจะคืนยอดจองทั้งหมด และเก็บเอกสารที่ยกเลิกไว้"}
          </DialogDescription>
          <p className="font-mono font-semibold">{order?.number}</p>
          {order?.lines.map((l) => (
            <p className="text-sm" key={l.id}>
              {l.product.sku} · {l.quantity} {l.product.baseUom}
            </p>
          ))}
          <Button
            disabled={disabled}
            onClick={() => confirm && action({ action: confirm })}
          >
            {busy
              ? "กำลังดำเนินการ…"
              : confirm === "ship"
                ? "ยืนยันจ่ายออก"
                : "ยืนยันยกเลิกคำสั่งซื้อ"}
          </Button>
          {feedback?.kind === "error" && <Feedback value={feedback} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={override}
        onOpenChange={(v) => {
          if (!v && !disabled) setOverride(v);
        }}
      >
        <DialogContent>
          <DialogTitle>ข้อยกเว้น FIFO / FEFO</DialogTitle>
          <DialogDescription>
            เลือกรอบรับเข้าที่ต้องใช้ก่อน แล้วระบุเหตุผล
            ผู้มีสิทธิ์และเหตุผลจะถูกเก็บกับใบหยิบ
            ยังข้ามข้อห้ามสินค้าหมดอายุไม่ได้
          </DialogDescription>
          <fieldset disabled={disabled} className="space-y-3">
            {!stock ? (
              <LoadingState />
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  แสดงตัวเลือกจาก {stock.limit} รอบรับเข้าแรกในพื้นที่ ·
                  สต็อกที่เลือกต้องตรงกับคำสั่งซื้อ
                </p>
                {stock.layers
                  .filter(
                    (l) =>
                      order?.lines.some(
                        (line) => line.productId === l.productId,
                      ) &&
                      ["STORAGE", "PICKING"].includes(l.location.type) &&
                      (!l.lot?.expiresOn || l.lot.expiresOn >= stock.today) &&
                      l.qtyOnHand > l.qtyAllocated,
                  )
                  .map((l) => (
                    <label
                      key={l.id}
                      className="flex gap-3 rounded-lg border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={preferred.includes(l.id)}
                        onChange={(e) =>
                          setPreferred(
                            e.target.checked
                              ? [...preferred, l.id]
                              : preferred.filter((x) => x !== l.id),
                          )
                        }
                      />
                      <span>
                        {l.product.sku} · {l.location.barcode}
                        <br />
                        Lot {l.lot?.number || "—"} ·{" "}
                        {l.lot?.expiresOn || "ไม่มีวันหมดอายุ"} · ไม่จอง{" "}
                        {l.qtyOnHand - l.qtyAllocated}
                      </span>
                    </label>
                  ))}
              </>
            )}
            <Label htmlFor="override-reason">เหตุผล</Label>
            <Input
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="อธิบายเหตุผลที่ต้องใช้รอบรับเข้านี้"
            />
            <Button
              disabled={
                !preferred.length || reason.trim().length < 5 || disabled
              }
              onClick={() =>
                action({
                  action: "reserve",
                  preferredLayers: preferred,
                  reason: reason.trim(),
                })
              }
            >
              อนุมัติข้อยกเว้นและจอง
            </Button>
            {feedback?.kind === "error" && <Feedback value={feedback} />}
          </fieldset>
        </DialogContent>
      </Dialog>
    </div>
  );
}
