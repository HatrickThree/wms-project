"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Feedback, type FeedbackValue } from "./common";
import { ScanInput } from "./scan-input";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { ApiError, request } from "@/lib/wms";
import { ReceiptSchema } from "@/lib/validations/stock.schema";
import type { CatalogProduct } from "@/lib/stock-types";

export function ReceivingScreen() {
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [form, setForm] = useState({
    referenceDoc: "",
    locationBarcode: "",
    quantity: 1,
    unitId: "",
    lotNumber: "",
    expiresOn: "",
  });
  const [serial, setSerial] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null);
  const operation = useRef({ fingerprint: "", key: "" });
  const pending = useRef(false);
  const dirty =
    !saved &&
    (!!code ||
      !!form.referenceDoc ||
      !!form.locationBarcode ||
      serials.length > 0);
  useUnsavedChanges(!!dirty || uncertain);
  const unit = product?.units?.find((u) => u.id === form.unitId);
  const baseQuantity = form.quantity * (unit?.factor || 1);
  const findProduct = async (value = code) => {
    if (lookup || busy) return;
    setLookup(true);
    setFeedback(null);
    try {
      const p = await request<CatalogProduct>(
        `/api/scan/product?code=${encodeURIComponent(value.trim())}`,
      );
      setProduct(p);
      setCode(p.sku);
      setForm((f) => ({ ...f, unitId: "" }));
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
  const addSerial = () => {
    const value = serial.trim();
    if (!value || value.length < 3) {
      setFeedback({ kind: "error", text: "Serial ต้องมีอย่างน้อย 3 ตัวอักษร" });
      return;
    }
    if (serials.includes(value)) {
      setFeedback({ kind: "error", text: `${value} อยู่ในรายการแล้ว` });
      return;
    }
    if (serials.length >= 500) {
      setFeedback({
        kind: "error",
        text: "รองรับไม่เกิน 500 Serial ต่อรอบรับเข้า",
      });
      return;
    }
    setSerials([...serials, value]);
    setSerial("");
    setFeedback(null);
  };
  const submit = async () => {
    if (pending.current || !product) return;
    if (serial.trim()) {
      setFeedback({
        kind: "error",
        text: "มี Serial ที่ยังไม่เพิ่ม กรุณากดเพิ่มหรือเคลียร์ช่อง Serial ก่อนบันทึก",
      });
      return;
    }
    const raw = {
      productId: product.id,
      referenceDoc: form.referenceDoc.trim(),
      sku: product.sku,
      locationBarcode: form.locationBarcode.trim(),
      quantity: form.quantity,
      unitId: form.unitId || undefined,
      lotNumber: form.lotNumber.trim() || undefined,
      expiresOn: form.expiresOn || undefined,
      serialNumbers: serials,
    };
    const fingerprint = JSON.stringify(raw);
    if (operation.current.fingerprint !== fingerprint)
      operation.current = { fingerprint, key: crypto.randomUUID() };
    const parsed = ReceiptSchema.safeParse({
      ...raw,
      operationId: operation.current.key,
    });
    if (!parsed.success) {
      setFeedback({ kind: "error", text: parsed.error.issues[0].message });
      return;
    }
    if (product.trackSerial && serials.length !== baseQuantity) {
      setFeedback({
        kind: "error",
        text: `ต้องสแกน ${baseQuantity} Serial ตามหน่วยหลัก ปัจจุบันมี ${serials.length}`,
      });
      return;
    }
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await request<{
        receivedCount: number;
        baseUom: string;
        locationBarcode: string;
        newQtyOnHand: number;
      }>("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      setSaved(true);
      setUncertain(false);
      setFeedback({
        kind: "success",
        text: `บันทึกแล้ว ${result.receivedCount} ${result.baseUom} ที่ ${result.locationBarcode} · ยอดถือครองตำแหน่งนี้ ${result.newQtyOnHand} ${result.baseUom}`,
      });
    } catch (e) {
      const unknown = !(e instanceof ApiError) || (e.status || 500) >= 500;
      setUncertain(unknown);
      setFeedback({
        kind: unknown ? "uncertain" : "error",
        text: unknown
          ? "ยังยืนยันผลไม่ได้ กดตรวจผลรายการเดิมได้โดยไม่บันทึกซ้ำ อย่าเปลี่ยนรายการจนตรวจผลสำเร็จ"
          : e.message,
      });
    } finally {
      setBusy(false);
      pending.current = false;
    }
  };
  const reset = () => {
    setCode("");
    setProduct(null);
    setForm({
      referenceDoc: "",
      locationBarcode: "",
      quantity: 1,
      unitId: "",
      lotNumber: "",
      expiresOn: "",
    });
    setSerial("");
    setSerials([]);
    setSaved(false);
    setFeedback(null);
    operation.current = { fingerprint: "", key: "" };
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS / RECEIVE"
        title="รับสินค้าเข้า"
        description="รับเป็นจำนวนหรือ Serial พร้อม Lot วันหมดอายุ และแปลงหน่วยบรรจุเป็นหน่วยหลัก"
        action={
          <Button asChild variant="outline">
            <Link href="/stock">ดูยอดและ Lot</Link>
          </Button>
        }
      />
      {feedback && <Feedback value={feedback} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.target as HTMLElement).tagName !== "BUTTON"
          )
            e.preventDefault();
        }}
        className="grid items-start gap-6 xl:grid-cols-[1fr_320px]"
      >
        <fieldset disabled={busy || saved || uncertain} className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลรับเข้า</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="field-group">
                <Label htmlFor="receive-doc">เลขที่เอกสารรับเข้า</Label>
                <Input
                  id="receive-doc"
                  required
                  value={form.referenceDoc}
                  onChange={(e) =>
                    setForm({ ...form, referenceDoc: e.target.value })
                  }
                />
              </div>
              <div className="field-group">
                <Label htmlFor="receive-location">ชั้นวางปลายทาง</Label>
                <ScanInput
                  id="receive-location"
                  scannerTitle="สแกนชั้นวางปลายทาง"
                  value={form.locationBarcode}
                  onChange={(e) =>
                    setForm({ ...form, locationBarcode: e.target.value })
                  }
                  onScanValue={(value) =>
                    setForm((f) => ({ ...f, locationBarcode: value }))
                  }
                />
              </div>
              <div className="field-group">
                <Label htmlFor="receive-product">SKU / บาร์โค้ดสินค้า</Label>
                <div className="flex flex-wrap gap-2">
                  <ScanInput
                    id="receive-product"
                    scannerTitle="สแกนสินค้าเพื่อรับเข้า"
                    value={code}
                    disabled={serials.length > 0}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setProduct(null);
                    }}
                    onScanValue={findProduct}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lookup || serials.length > 0}
                    onClick={() => void findProduct().catch(() => {})}
                  >
                    {lookup ? "กำลังค้นหา…" : "ตรวจสินค้า"}
                  </Button>
                </div>
              </div>
              {product && (
                <div className="space-y-2 rounded-xl bg-blue-50 p-4 text-sm">
                  <p className="font-semibold">
                    {product.sku} · {product.name}
                  </p>
                  <div className="flex gap-2">
                    <Badge>{product.trackSerial ? "Serial" : "จำนวน"}</Badge>
                    <Badge variant="secondary">{product.issuePolicy}</Badge>
                  </div>
                  <p>หน่วยหลัก: {product.baseUom}</p>
                </div>
              )}
              {product && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="field-group">
                      <Label htmlFor="receive-qty">จำนวนรับเข้า</Label>
                      <Input
                        id="receive-qty"
                        type="number"
                        min="1"
                        step="1"
                        value={form.quantity}
                        onChange={(e) =>
                          setForm({ ...form, quantity: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <Label htmlFor="receive-unit">หน่วยรับเข้า</Label>
                      <select
                        id="receive-unit"
                        className="h-12 rounded-lg border bg-background px-3 text-sm"
                        value={form.unitId}
                        onChange={(e) =>
                          setForm({ ...form, unitId: e.target.value })
                        }
                      >
                        <option value="">{product.baseUom} · หน่วยหลัก</option>
                        {product.units?.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} · {u.factor} {product.baseUom}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-primary">
                    {form.quantity} {unit?.name || product.baseUom} ={" "}
                    {baseQuantity} {product.baseUom}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="field-group">
                      <Label htmlFor="receive-lot">
                        Lot{" "}
                        {product.trackLot || product.issuePolicy === "FEFO"
                          ? "(จำเป็น)"
                          : "(ถ้ามี)"}
                      </Label>
                      <Input
                        id="receive-lot"
                        value={form.lotNumber}
                        onChange={(e) =>
                          setForm({ ...form, lotNumber: e.target.value })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <Label htmlFor="receive-expiry">
                        วันหมดอายุ{" "}
                        {product.issuePolicy === "FEFO"
                          ? "(จำเป็น)"
                          : "(ถ้ามี)"}
                      </Label>
                      <Input
                        id="receive-expiry"
                        type="date"
                        value={form.expiresOn}
                        onChange={(e) =>
                          setForm({ ...form, expiresOn: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          {product?.trackSerial && (
            <Card>
              <CardHeader>
                <CardTitle>
                  สแกน Serial · {serials.length} / {baseQuantity} หน่วยหลัก
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label htmlFor="receive-serial">Serial Number</Label>
                <div className="flex flex-wrap gap-2">
                  <ScanInput
                    id="receive-serial"
                    scannerTitle="สแกน Serial รับเข้า"
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
                  <Button type="button" variant="outline" onClick={addSerial}>
                    <Plus />
                    เพิ่ม
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  แต่ละ Serial แทนสินค้า 1 หน่วยหลัก กด Enter เพื่อเพิ่ม
                  การสแกนยังไม่เปลี่ยนยอด
                </p>
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {serials.map((sn) => (
                    <div
                      key={sn}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <span className="font-mono text-sm">{sn}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`นำ ${sn} ออก`}
                        onClick={() =>
                          setSerials(serials.filter((s) => s !== sn))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </fieldset>
        <Card>
          <CardHeader>
            <CardTitle>ตรวจและบันทึก</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>{form.referenceDoc || "ยังไม่ระบุเอกสาร"}</p>
            <p className="font-medium">{product?.sku || "ยังไม่ตรวจสินค้า"}</p>
            <p>ปลายทาง: {form.locationBarcode || "ยังไม่ระบุ"}</p>
            <p>
              Lot: {form.lotNumber || "ไม่ระบุ"} ·{" "}
              {form.expiresOn || "ไม่มีวันหมดอายุ"}
            </p>
            <p className="text-xl font-semibold">
              {product ? `${baseQuantity} ${product.baseUom}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              ระบบตรวจ Serial ซ้ำ Lot และวันหมดอายุอีกครั้งก่อนบันทึก
              ส่งรายการเดิมซ้ำด้วยรหัสเดียวกันได้โดยไม่เพิ่มยอดซ้ำ
            </p>
            {saved ? (
              <Button type="button" onClick={reset} className="w-full">
                <CheckCircle2 />
                เริ่มรับเข้ารายการใหม่
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={busy || !product || lookup}
                className="w-full"
              >
                {busy
                  ? "กำลังตรวจและบันทึก…"
                  : uncertain
                    ? "ตรวจผลรายการเดิม"
                    : "บันทึกรับเข้า"}
              </Button>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
