"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, LoadingState, Feedback, EmptyState } from "./common";
import { ScanInput } from "./scan-input";
import { request, locationTypeLabels } from "@/lib/wms";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { useWarehouseCommand, CommandFeedback } from "./use-warehouse-command";
import type { CatalogProduct, StockData } from "@/lib/stock-types";
export function TransfersScreen() {
  const params = useSearchParams();
  const [initialId, setInitialId] = useState(params.get("layerId") || "");
  const [productId, setProductId] = useState("");
  const [code, setCode] = useState("");
  const [stock, setStock] = useState<StockData | null>(null);
  const [selected, setSelected] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [lookup, setLookup] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    referenceDoc: "",
    fromLocationBarcode: "",
    toLocationBarcode: "",
    quantity: 1,
    unitId: "",
  });
  const [serial, setSerial] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const command = useWarehouseCommand();
  const disabled = command.disabled || saved;
  useUnsavedChanges(
    command.uncertain ||
      (!saved &&
        (!!form.referenceDoc ||
          !!form.fromLocationBarcode ||
          !!form.toLocationBarcode ||
          serials.length > 0 ||
          !!serial)),
  );
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      ...(initialId ? { layerId: initialId } : {}),
      ...(productId ? { productId } : {}),
    });
    request<StockData>(`/api/stock?${query}`)
      .then((d) => {
        if (active) {
          setStock(d);
          setSelected((old) =>
            d.layers.some((l) => l.id === old) ? old : d.layers[0]?.id || "",
          );
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [initialId, productId, refresh]);
  const layer = stock?.layers.find((l) => l.id === selected);
  const unit = layer?.product.units?.find((u) => u.id === form.unitId);
  const quantity = form.quantity * (unit?.factor || 1);
  const find = async (value = code) => {
    setLookup(true);
    try {
      const p = await request<CatalogProduct>(
        `/api/scan/product?code=${encodeURIComponent(value.trim())}`,
      );
      setCode(p.sku);
      setProductId(p.id);
      setInitialId("");
      setForm({ ...form, unitId: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่พบสินค้า");
      throw e;
    } finally {
      setLookup(false);
    }
  };
  const addSerial = () => {
    const value = serial.trim();
    if (value.length < 3) {
      setError("Serial ต้องมีอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (serials.includes(value)) {
      setError("Serial นี้อยู่ในรายการย้ายแล้ว");
      return;
    }
    setSerials([...serials, value]);
    setSerial("");
    setError("");
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS / PUTAWAY & TRANSFER"
        title="จัดเก็บและย้ายตำแหน่ง"
        description="ตรวจต้นทางและปลายทาง ย้ายเฉพาะยอดที่ไม่จอง โดยคง Lot วันหมดอายุ และวันรับเข้าเดิม"
      />
      <CommandFeedback command={command} />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>เลือกสินค้าต้นทาง</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (serial.trim()) {
                  setError(
                    "มี Serial ที่ยังไม่เพิ่ม กรุณากดเพิ่มหรือเคลียร์ช่องก่อนบันทึกย้าย",
                  );
                  return;
                }
                if (!layer) return;
                void command.send(
                  "/api/transfers",
                  {
                    ...form,
                    unitId: form.unitId || undefined,
                    layerId: layer.id,
                    serialNumbers: serials,
                  },
                  (result) => {
                    setSaved(true);
                    setRefresh((v) => v + 1);
                    return {
                      kind: "success",
                      text: `ย้ายแล้ว ${result.movedCount} ${result.baseUom} · ${result.from} → ${result.to}`,
                    };
                  },
                );
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
                <div className="field-group">
                  <Label htmlFor="transfer-product">
                    SKU / บาร์โค้ดสินค้า (ค้นหาเพื่อกรองรอบรับเข้า)
                  </Label>
                  <div className="flex gap-2">
                    <ScanInput
                      id="transfer-product"
                      scannerTitle="สแกนสินค้าที่ต้องย้าย"
                      value={code}
                      disabled={serials.length > 0}
                      onChange={(e) => setCode(e.target.value)}
                      onScanValue={find}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={lookup || serials.length > 0}
                      onClick={() => void find().catch(() => {})}
                    >
                      ค้นหา
                    </Button>
                  </div>
                </div>
                {!stock ? (
                  <LoadingState />
                ) : !stock.layers.length ? (
                  <EmptyState
                    title="ไม่มีรอบรับเข้าคงเหลือ"
                    description="ลองค้นหา SKU อื่น หรือรับสินค้าก่อนเริ่มจัดเก็บ"
                  />
                ) : (
                  <>
                    <div className="field-group">
                      <Label htmlFor="transfer-layer">
                        รอบรับเข้า / ตำแหน่ง / Lot ต้นทาง
                      </Label>
                      <select
                        id="transfer-layer"
                        className="h-12 w-full rounded-lg border bg-background px-3 text-sm"
                        value={selected}
                        disabled={serials.length > 0}
                        onChange={(e) => {
                          setSelected(e.target.value);
                          setForm({
                            ...form,
                            unitId: "",
                            fromLocationBarcode: "",
                          });
                        }}
                      >
                        {stock.layers.map((l) => (
                          <option value={l.id} key={l.id}>
                            {l.product.sku} · {l.location.barcode} · Lot{" "}
                            {l.lot?.number || "—"} · ไม่จอง{" "}
                            {l.qtyOnHand - l.qtyAllocated}
                            {" · รับ "}
                            {new Date(l.receivedAt).toLocaleDateString(
                              "th-TH",
                              { timeZone: "Asia/Bangkok" },
                            )}
                            {" · "}
                            {l.referenceDoc}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        พบ {stock.count} รอบรับเข้า · แสดงไม่เกิน {stock.limit}{" "}
                        รายการตามคำค้น
                      </p>
                    </div>
                    {layer && (
                      <>
                        <div className="rounded-lg bg-muted p-4 text-sm">
                          <p className="font-semibold">
                            {layer.product.name} · {layer.product.baseUom}
                          </p>
                          <p>
                            วันรับเข้าเดิม{" "}
                            {new Date(layer.receivedAt).toLocaleString(
                              "th-TH",
                              { timeZone: "Asia/Bangkok" },
                            )}
                          </p>
                          <p>
                            Lot {layer.lot?.number || "—"} · หมดอายุ{" "}
                            {layer.lot?.expiresOn || "ไม่ระบุ"}
                          </p>
                          <p>
                            ต้นทาง{" "}
                            {locationTypeLabels[layer.location.type] ||
                              layer.location.type}
                          </p>
                        </div>
                        <div className="field-group">
                          <Label htmlFor="transfer-doc">
                            เลขที่เอกสารย้าย / จัดเก็บ
                          </Label>
                          <Input
                            id="transfer-doc"
                            value={form.referenceDoc}
                            onChange={(e) =>
                              setForm({ ...form, referenceDoc: e.target.value })
                            }
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="field-group">
                            <Label htmlFor="transfer-from">
                              สแกนตำแหน่งต้นทาง
                            </Label>
                            <ScanInput
                              id="transfer-from"
                              scannerTitle="สแกนชั้นวางต้นทางย้าย"
                              value={form.fromLocationBarcode}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  fromLocationBarcode: e.target.value,
                                })
                              }
                              onScanValue={(v) =>
                                setForm((f) => ({
                                  ...f,
                                  fromLocationBarcode: v,
                                }))
                              }
                            />
                          </div>
                          <div className="field-group">
                            <Label htmlFor="transfer-to">
                              สแกนตำแหน่งปลายทาง
                            </Label>
                            <ScanInput
                              id="transfer-to"
                              scannerTitle="สแกนชั้นวางปลายทางย้าย"
                              value={form.toLocationBarcode}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  toLocationBarcode: e.target.value,
                                })
                              }
                              onScanValue={(v) =>
                                setForm((f) => ({ ...f, toLocationBarcode: v }))
                              }
                            />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="field-group">
                            <Label htmlFor="transfer-quantity">จำนวนย้าย</Label>
                            <Input
                              id="transfer-quantity"
                              type="number"
                              min="1"
                              step="1"
                              value={form.quantity}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  quantity: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <Label htmlFor="transfer-unit">หน่วยย้าย</Label>
                            <select
                              id="transfer-unit"
                              className="h-12 w-full rounded-lg border bg-background px-3 text-sm"
                              value={form.unitId}
                              onChange={(e) =>
                                setForm({ ...form, unitId: e.target.value })
                              }
                            >
                              <option value="">{layer.product.baseUom}</option>
                              {layer.product.units?.map((u) => (
                                <option value={u.id} key={u.id}>
                                  {u.name} × {u.factor}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {layer.product.trackSerial && (
                          <>
                            <Label htmlFor="transfer-serial">
                              Serial ที่ย้าย · {serials.length} / {quantity}{" "}
                              หน่วยหลัก
                            </Label>
                            <div className="flex gap-2">
                              <ScanInput
                                id="transfer-serial"
                                scannerTitle="สแกน Serial ที่ย้าย"
                                value={serial}
                                onChange={(e) => setSerial(e.target.value)}
                                onScanValue={setSerial}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addSerial();
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={addSerial}
                              >
                                เพิ่ม
                              </Button>
                            </div>
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                              {serials.map((sn) => (
                                <div
                                  className="flex items-center justify-between rounded-lg border p-2 text-sm"
                                  key={sn}
                                >
                                  <span className="font-mono">{sn}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`นำ ${sn} ออกจากรายการย้าย`}
                                    onClick={() =>
                                      setSerials(
                                        serials.filter((s) => s !== sn),
                                      )
                                    }
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </fieldset>
              <div className="flex flex-wrap gap-3">
                {saved ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setSaved(false);
                      setForm({
                        referenceDoc: "",
                        fromLocationBarcode: "",
                        toLocationBarcode: "",
                        quantity: 1,
                        unitId: "",
                      });
                      setSerials([]);
                      setSerial("");
                    }}
                  >
                    ย้ายรายการถัดไป
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      disabled ||
                      !layer ||
                      !form.referenceDoc ||
                      !form.fromLocationBarcode ||
                      !form.toLocationBarcode
                    }
                  >
                    {command.busy
                      ? "กำลังตรวจและย้าย…"
                      : "บันทึกจัดเก็บ / ย้าย"}
                  </Button>
                )}
                {!disabled && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSerials([]);
                      setSerial("");
                    }}
                  >
                    ล้าง Serial ที่ยังไม่บันทึก
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ตรวจการย้าย</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-mono">
              {layer?.product.sku || "ยังไม่เลือกรอบรับเข้า"}
            </p>
            <p>
              {form.fromLocationBarcode || "ต้นทาง"} →{" "}
              {form.toLocationBarcode || "ปลายทาง"}
            </p>
            <p className="text-xl font-semibold">
              {layer ? `${quantity} ${layer.product.baseUom}` : "—"}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              ยอดรวม SKU ภายในพื้นที่ต้องเท่าเดิมหลังย้าย ·
              ย้ายจากจุดพักรับเข้าขึ้นจัดเก็บเป็น Putaway ·
              ห้ามย้ายหน่วยที่จอง/หยิบแล้ว ·
              ยังไม่เปิดขั้นตอนปล่อยสินค้าจากพื้นที่กักกัน
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
