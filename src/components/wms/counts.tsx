"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { ScanInput } from "./scan-input";
import { request } from "@/lib/wms";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { useWarehouseCommand, CommandFeedback } from "./use-warehouse-command";
import type { CatalogProduct } from "@/lib/stock-types";
import type {
  CountSummary,
  CountDetails,
  CountEntryRow,
} from "@/lib/count-types";
const statusLabels: Record<string, string> = {
  OPEN: "กำลังตรวจนับ",
  SUBMITTED: "ส่งผลแล้ว · รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  STALE: "ข้อมูลเปลี่ยน · ต้องนับใหม่",
  CANCELLED: "ยกเลิก",
};
const emptyEntry = {
  locationBarcode: "",
  lotNumber: "",
  expiresOn: "",
  quantity: "",
  unitId: "",
};
const selectClass = "h-12 w-full rounded-lg border bg-background px-3 text-sm";
export function CountsScreen() {
  const [runs, setRuns] = useState<CountSummary[] | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<CountDetails | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [mode, setMode] = useState("");
  const [lookup, setLookup] = useState(false);
  const [entry, setEntry] = useState(emptyEntry);
  const [entryId, setEntryId] = useState("");
  const [entryDirty, setEntryDirty] = useState(false);
  const [serial, setSerial] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<
    "submit" | "approve" | "cancel" | null
  >(null);
  const [reason, setReason] = useState("");
  const [complete, setComplete] = useState(false);
  const command = useWarehouseCommand();
  const disabled = command.disabled;
  useUnsavedChanges(
    entryDirty ||
      !!number ||
      !!code ||
      !!serial ||
      command.uncertain ||
      !!confirm,
  );
  useEffect(() => {
    let active = true;
    request<{ runs: CountSummary[] }>("/api/counts")
      .then((d) => {
        if (active) setRuns(d.runs);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let active = true;
    request<CountDetails>(`/api/counts/${selected}`)
      .then((d) => {
        if (active) {
          setDetail(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected, refresh]);
  const find = async (value = code) => {
    setLookup(true);
    try {
      const p = await request<CatalogProduct>(
        `/api/scan/product?code=${encodeURIComponent(value.trim())}`,
      );
      setCode(p.sku);
      setProduct(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่พบสินค้า");
      throw e;
    } finally {
      setLookup(false);
    }
  };
  const chooseEntry = (row?: CountEntryRow) => {
    if (entryDirty) return;
    setEntryId(row?.id || "");
    setEntry(
      row
        ? {
            locationBarcode: row.locationBarcode,
            lotNumber: row.lotNumber,
            expiresOn: row.expiresOn || "",
            quantity:
              row.enteredQuantity === null ? "" : String(row.enteredQuantity),
            unitId:
              detail?.product.units?.find(
                (u) =>
                  u.name === row.enteredUom &&
                  u.factor === row.conversionFactor,
              )?.id || "",
          }
        : emptyEntry,
    );
    setSerials(row?.serialNumbers || []);
    setSerial("");
  };
  const changed = (values: Partial<typeof emptyEntry>) => {
    setEntry({ ...entry, ...values });
    setEntryDirty(true);
  };
  const saveEntry = () => {
    if (!detail) return;
    if (serial.trim()) {
      setError(
        "มี Serial ที่ยังไม่เพิ่ม กรุณากดเพิ่มหรือเคลียร์ช่องก่อนบันทึกผลนับ",
      );
      return;
    }
    const isSerial = detail.product.trackSerial;
    void command.send(
      `/api/counts/${detail.id}`,
      {
        action: "entry",
        locationBarcode: entry.locationBarcode,
        lotNumber: entry.lotNumber,
        expiresOn: entry.expiresOn || undefined,
        quantity: isSerial ? serials.length : Number(entry.quantity),
        unitId: isSerial ? undefined : entry.unitId || undefined,
        serialNumbers: serials,
      },
      () => {
        setEntryDirty(false);
        setRefresh((v) => v + 1);
        return { kind: "success", text: "เก็บผลนับแล้ว ยังไม่ปรับยอดสต็อก" };
      },
    );
  };
  const addSerial = () => {
    const value = serial.trim();
    if (value.length < 3) {
      setError("Serial ต้องมีอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (serials.includes(value)) {
      setError("Serial นี้อยู่ในผลนับตำแหน่งนี้แล้ว");
      return;
    }
    setSerials([...serials, value]);
    setSerial("");
    setEntryDirty(true);
    setError("");
  };
  const step = () => {
    if (!detail || !confirm) return;
    void command.send(
      `/api/counts/${detail.id}`,
      {
        action: confirm,
        ...(confirm === "submit" ? { confirmComplete: complete } : { reason }),
      },
      (result) => {
        setConfirm(null);
        setRefresh((v) => v + 1);
        return {
          kind: result.status === "STALE" ? "error" : "success",
          text:
            result.message ||
            (result.status === "APPROVED"
              ? "อนุมัติแล้ว ผลต่างและประวัติถูกบันทึกพร้อมกัน"
              : result.status === "SUBMITTED"
                ? "ส่งผลนับแล้ว รอผู้มีสิทธิ์ตรวจและอนุมัติ"
                : "ยกเลิกงานตรวจนับแล้ว"),
        };
      },
    );
  };
  const editable = detail?.status === "OPEN";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OPERATIONS / CYCLE COUNT"
        title="ตรวจนับสินค้า"
        description="ตรวจครบ SKU ในทุกตำแหน่งที่ระบบมีแผน โดยไม่แสดงยอดอ้างอิงระหว่างนับ ส่งผลให้ผู้มีสิทธิ์อนุมัติก่อนปรับยอด"
      />
      <CommandFeedback command={command} />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <div className="field-group">
          <Label htmlFor="count-select">
            งานตรวจนับล่าสุด (ไม่เกิน 100 งาน)
          </Label>
          <select
            id="count-select"
            className={selectClass}
            disabled={disabled || entryDirty}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setEntry(emptyEntry);
              setEntryId("");
              setSerials([]);
            }}
          >
            <option value="">เริ่มงานใหม่</option>
            {runs?.map((r) => (
              <option value={r.id} key={r.id}>
                {r.number} · {r.product.sku} ·{" "}
                {statusLabels[r.status] || r.status}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="outline"
          disabled={disabled || entryDirty}
          onClick={() => setRefresh((v) => v + 1)}
        >
          โหลดข้อมูลใหม่
        </Button>
      </div>
      {!selected && (
        <Card>
          <CardHeader>
            <CardTitle>เริ่มตรวจนับทั้ง SKU</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={disabled} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="field-group">
                  <Label htmlFor="count-number">เลขที่งานตรวจนับ</Label>
                  <Input
                    id="count-number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <Label htmlFor="count-product">SKU / บาร์โค้ดสินค้า</Label>
                  <div className="flex gap-2">
                    <ScanInput
                      id="count-product"
                      scannerTitle="สแกนสินค้าที่ต้องตรวจนับ"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        setProduct(null);
                      }}
                      onScanValue={find}
                    />
                    <Button
                      variant="outline"
                      disabled={lookup}
                      onClick={() => void find().catch(() => {})}
                    >
                      ตรวจ
                    </Button>
                  </div>
                </div>
              </div>
              {product && (
                <p className="text-sm font-semibold">
                  {product.sku} · {product.name} · หน่วยหลัก {product.baseUom}
                </p>
              )}
              <div className="field-group">
                <Label htmlFor="count-mode">การทำงานคลังระหว่างนับ</Label>
                <select
                  id="count-mode"
                  className={selectClass}
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="" disabled>
                    เลือกวิธีควบคุมก่อนเริ่มงาน
                  </option>
                  <option value="SNAPSHOT">
                    ทำงานคลังต่อได้ · ต้องนับใหม่หากยอด/จองเปลี่ยน
                  </option>
                  <option value="LOCK">
                    หยุดรับ จ่าย และย้าย SKU นี้จนปิดงานนับ
                  </option>
                </select>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                ต้องไม่มีสต็อกที่จองหรือหยิบค้างอยู่ก่อนเริ่มนับ ·
                ยอดปรับหลังอนุมัติเท่านั้น · การย้าย Serial
                ผิดตำแหน่งและการพบสินค้าที่เคยจ่ายแล้วต้องตรวจรับคืน/ย้ายให้ถูกต้องก่อนเริ่มนับใหม่
              </p>
              <Button
                disabled={!number.trim() || !product || !mode || lookup}
                onClick={() =>
                  void command.send(
                    "/api/counts",
                    { number: number.trim(), productId: product?.id, mode },
                    (result) => {
                      setSelected(result.id);
                      setNumber("");
                      setCode("");
                      setProduct(null);
                      setRefresh((v) => v + 1);
                      return {
                        kind: "success",
                        text: "เปิดแผนตรวจนับแล้ว ยังไม่มีการปรับยอด",
                      };
                    },
                  )
                }
              >
                เริ่มตรวจนับ
              </Button>
            </fieldset>
          </CardContent>
        </Card>
      )}
      {selected && !detail ? (
        <LoadingState />
      ) : (
        detail && (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="break-all font-mono">
                    {detail.number}
                  </CardTitle>
                  <Badge
                    variant={
                      detail.status === "APPROVED" ? "success" : "secondary"
                    }
                  >
                    {statusLabels[detail.status] || detail.status}
                  </Badge>
                </div>
                <p className="text-sm">
                  {detail.product.sku} · {detail.product.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  ผู้เริ่มนับ {detail.startedBy} ·{" "}
                  {detail.mode === "LOCK"
                    ? "หยุดงาน SKU นี้ระหว่างนับ"
                    : "ทำงานต่อได้ แต่ไม่อนุมัติหากข้อมูลเปลี่ยน"}
                </p>
                {detail.reason && (
                  <p className="text-sm">เหตุผล: {detail.reason}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <CountMobileEntries
                  detail={detail}
                  editable={!!editable}
                  disabled={disabled || entryDirty}
                  chooseEntry={chooseEntry}
                />
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-3">ตำแหน่ง / Lot</th>
                        <th className="p-3">
                          ผลนับ ({detail.product.baseUom})
                        </th>
                        {detail.entries.some(
                          (e) => e.expectedQuantity !== undefined,
                        ) && (
                          <>
                            <th className="p-3">อ้างอิง</th>
                            <th className="p-3">ผลต่าง</th>
                          </>
                        )}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.entries.map((e) => (
                        <tr className="border-b" key={e.id}>
                          <td className="p-3">
                            <p className="font-mono font-semibold">
                              {e.locationBarcode}
                            </p>
                            <p>Lot {e.lotNumber || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {e.expiresOn || "ไม่ระบุวันหมดอายุ"}
                            </p>
                          </td>
                          <td className="p-3">
                            {e.actualQuantity === null ? (
                              <span className="text-muted-foreground">
                                ยังไม่นับ
                              </span>
                            ) : (
                              <>
                                <p className="font-semibold">
                                  {e.actualQuantity}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {e.countedBy}
                                </p>
                                {!!e.missingSerialNumbers?.length && (
                                  <p className="max-w-xs break-all text-xs text-amber-800">
                                    ไม่พบ Serial:{" "}
                                    {e.missingSerialNumbers.join(", ")}
                                  </p>
                                )}
                                {!!e.addedSerialNumbers?.length && (
                                  <p className="max-w-xs break-all text-xs text-amber-800">
                                    พบ Serial เพิ่ม:{" "}
                                    {e.addedSerialNumbers.join(", ")}
                                  </p>
                                )}
                              </>
                            )}
                          </td>
                          {e.expectedQuantity !== undefined && (
                            <>
                              <td className="p-3">{e.expectedQuantity}</td>
                              <td
                                className={`p-3 font-semibold ${e.variance ? "text-amber-800" : "text-emerald-700"}`}
                              >
                                {e.variance === null
                                  ? "—"
                                  : e.variance! > 0
                                    ? `+${e.variance}`
                                    : e.variance}
                              </td>
                            </>
                          )}
                          <td className="p-3">
                            {editable && (
                              <Button
                                variant="outline"
                                disabled={disabled || entryDirty}
                                onClick={() => chooseEntry(e)}
                              >
                                {e.actualQuantity === null
                                  ? "นับตำแหน่งนี้"
                                  : "แก้ผลนับ"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!detail.entries.length && (
                  <p className="text-sm text-muted-foreground">
                    แผนยังไม่มีตำแหน่ง เพิ่มตำแหน่งที่พบ
                    หรือสำรวจพื้นที่จริงให้ครบก่อนส่งผลว่าไม่พบสินค้า
                  </p>
                )}
                {editable && (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={disabled || entryDirty}
                      onClick={() => chooseEntry()}
                    >
                      <Plus />
                      พบสินค้าในตำแหน่ง / Lot เพิ่มเติม
                    </Button>
                    <Button
                      disabled={
                        disabled ||
                        entryDirty ||
                        detail.entries.some((e) => e.actualQuantity === null)
                      }
                      onClick={() => {
                        command.setFeedback(null);
                        setConfirm("submit");
                        setComplete(false);
                      }}
                    >
                      ตรวจครบแล้ว ส่งผลนับ
                    </Button>
                  </div>
                )}
                {detail.status === "SUBMITTED" && detail.canApprove && (
                  <Button
                    disabled={disabled}
                    onClick={() => {
                      command.setFeedback(null);
                      setConfirm("approve");
                      setReason("");
                    }}
                  >
                    ทบทวนและอนุมัติผลต่าง
                  </Button>
                )}
                {["OPEN", "SUBMITTED"].includes(detail.status) && (
                  <Button
                    variant="outline"
                    disabled={disabled || entryDirty}
                    onClick={() => {
                      command.setFeedback(null);
                      setConfirm("cancel");
                      setReason("");
                    }}
                  >
                    ยกเลิกงานนับพร้อมเหตุผล
                  </Button>
                )}
                {detail.status === "APPROVED" && (
                  <p className="text-sm text-emerald-700">
                    อนุมัติโดย {detail.approvedBy} ·{" "}
                    {new Date(detail.approvedAt!).toLocaleString("th-TH", {
                      timeZone: "Asia/Bangkok",
                    })}{" "}
                    · บันทึกเป็นวันที่นับล่าสุดของ SKU แล้ว
                  </p>
                )}
              </CardContent>
            </Card>
            {editable && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {entryId ? "กรอกผลตำแหน่งที่เลือก" : "พบสินค้าเพิ่มเติม"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    หากไม่พบสินค้า ให้บันทึก 0 โดยไม่อ้างอิงยอดระบบ
                  </p>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEntry();
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
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="field-group">
                          <Label htmlFor="count-location">ตำแหน่งที่นับ</Label>
                          <ScanInput
                            id="count-location"
                            scannerTitle="สแกนตำแหน่งตรวจนับ"
                            value={entry.locationBarcode}
                            disabled={!!entryId}
                            onChange={(e) =>
                              changed({ locationBarcode: e.target.value })
                            }
                            onScanValue={(v) => changed({ locationBarcode: v })}
                          />
                        </div>
                        <div className="field-group">
                          <Label htmlFor="count-lot">Lot ตามฉลาก</Label>
                          <Input
                            id="count-lot"
                            disabled={!!entryId}
                            value={entry.lotNumber}
                            onChange={(e) =>
                              changed({ lotNumber: e.target.value })
                            }
                          />
                        </div>
                        <div className="field-group">
                          <Label htmlFor="count-expiry">วันหมดอายุ</Label>
                          <Input
                            id="count-expiry"
                            disabled={!!entryId}
                            type="date"
                            value={entry.expiresOn}
                            onChange={(e) =>
                              changed({ expiresOn: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      {detail.product.trackSerial ? (
                        <>
                          <Label htmlFor="count-serial">
                            Serial ที่พบ · {serials.length}{" "}
                            {detail.product.baseUom}
                          </Label>
                          <div className="flex gap-2">
                            <ScanInput
                              id="count-serial"
                              scannerTitle="สแกน Serial ที่ตรวจนับพบ"
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
                                  aria-label={`นำ ${sn} ออกจากผลนับ`}
                                  onClick={() => {
                                    setSerials(serials.filter((x) => x !== sn));
                                    setEntryDirty(true);
                                  }}
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="field-group">
                            <Label htmlFor="count-quantity">
                              จำนวนที่นับได้
                            </Label>
                            <Input
                              id="count-quantity"
                              type="number"
                              min="0"
                              step="1"
                              value={entry.quantity}
                              onChange={(e) =>
                                changed({ quantity: e.target.value })
                              }
                            />
                          </div>
                          <div className="field-group">
                            <Label htmlFor="count-unit">หน่วยนับ</Label>
                            <select
                              id="count-unit"
                              className={selectClass}
                              value={entry.unitId}
                              onChange={(e) =>
                                changed({ unitId: e.target.value })
                              }
                            >
                              <option value="">{detail.product.baseUom}</option>
                              {detail.product.units?.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name} × {u.factor}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="submit"
                          disabled={
                            !entry.locationBarcode ||
                            (!detail.product.trackSerial &&
                              entry.quantity === "")
                          }
                        >
                          บันทึกผลนับ{" "}
                          {detail.product.trackSerial
                            ? serials.length
                            : entry.quantity || "—"}{" "}
                          {detail.product.trackSerial
                            ? detail.product.baseUom
                            : detail.product.units?.find(
                                (u) => u.id === entry.unitId,
                              )?.name || detail.product.baseUom}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEntryDirty(false);
                            setEntry(emptyEntry);
                            setEntryId("");
                            setSerials([]);
                            setSerial("");
                          }}
                        >
                          ล้างค่าที่ยังไม่บันทึก
                        </Button>
                      </div>
                    </fieldset>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )
      )}
      {!runs ? (
        <LoadingState />
      ) : (
        !runs.length &&
        !selected && (
          <EmptyState
            title="ยังไม่มีงานตรวจนับ"
            description="เริ่มจากเลือก SKU และวิธีทำงานคลังระหว่างนับ"
          />
        )
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!disabled && !v) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {confirm === "submit"
              ? "ยืนยันตรวจครบทุกตำแหน่ง"
              : confirm === "approve"
                ? "อนุมัติผลต่างตรวจนับ"
                : "ยกเลิกงานตรวจนับ"}
          </DialogTitle>
          <DialogDescription>
            {confirm === "submit"
              ? "หลังส่งผลจะหยุดแก้รายการ และรอผู้มีสิทธิ์ตรวจผลต่าง ยอดสต็อกยังไม่เปลี่ยน"
              : confirm === "approve"
                ? "ระบบตรวจว่ายอดและการจองยังตรงกับตอนเริ่มนับ ก่อนปรับผลต่างและบันทึกประวัติในครั้งเดียว"
                : "ยกเลิกแล้วจะไม่ปรับยอด และปลดการหยุดงาน SKU หากใช้โหมดหยุดงาน"}
          </DialogDescription>
          <p className="font-mono font-semibold">{detail?.number}</p>
          {confirm === "submit" ? (
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={complete}
                disabled={disabled}
                onChange={(e) => setComplete(e.target.checked)}
              />
              สำรวจและนับ SKU นี้ครบทุกตำแหน่งแล้ว รวมตำแหน่งที่พบเพิ่ม
            </label>
          ) : (
            <div className="field-group">
              <Label htmlFor="count-reason">เหตุผล / หลักฐานที่ตรวจ</Label>
              <Input
                id="count-reason"
                value={reason}
                disabled={disabled}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          <Button
            disabled={
              disabled ||
              (confirm === "submit" && !complete) ||
              (confirm !== "submit" && reason.trim().length < 5)
            }
            onClick={step}
          >
            {command.busy
              ? "กำลังตรวจและบันทึก…"
              : confirm === "submit"
                ? "ส่งผลนับ"
                : confirm === "approve"
                  ? "อนุมัติและปรับผลต่าง"
                  : "ยืนยันยกเลิกงานนับ"}
          </Button>
          <CommandFeedback command={command} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CountMobileEntries({
  detail,
  editable,
  disabled,
  chooseEntry,
}: {
  detail: CountDetails;
  editable: boolean;
  disabled: boolean;
  chooseEntry: (row: CountEntryRow) => void;
}) {
  return (
    <div className="space-y-3 sm:hidden">
      {detail.entries.map((e) => (
        <section key={e.id} className="space-y-3 rounded-xl border p-4">
          <div>
            <p className="font-mono font-semibold">{e.locationBarcode}</p>
            <p className="text-sm">
              Lot {e.lotNumber || "—"} · {e.expiresOn || "ไม่ระบุวันหมดอายุ"}
            </p>
          </div>
          <div
            className={`grid gap-2 ${e.expectedQuantity === undefined ? "grid-cols-1" : "grid-cols-3"}`}
          >
            <div>
              <p className="text-xs text-muted-foreground">
                ผลนับ ({detail.product.baseUom})
              </p>
              <p className="font-semibold">
                {e.actualQuantity === null ? "ยังไม่นับ" : e.actualQuantity}
              </p>
            </div>
            {e.expectedQuantity !== undefined && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">อ้างอิง</p>
                  <p>{e.expectedQuantity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ผลต่าง</p>
                  <p
                    className={
                      e.variance
                        ? "font-semibold text-amber-800"
                        : "text-emerald-700"
                    }
                  >
                    {e.variance === null
                      ? "—"
                      : e.variance! > 0
                        ? `+${e.variance}`
                        : e.variance}
                  </p>
                </div>
              </>
            )}
          </div>
          {e.countedBy && (
            <p className="text-xs text-muted-foreground">
              นับโดย {e.countedBy}
            </p>
          )}
          {!!e.missingSerialNumbers?.length && (
            <p className="break-all text-xs text-amber-800">
              ไม่พบ Serial: {e.missingSerialNumbers.join(", ")}
            </p>
          )}
          {!!e.addedSerialNumbers?.length && (
            <p className="break-all text-xs text-amber-800">
              พบ Serial เพิ่ม: {e.addedSerialNumbers.join(", ")}
            </p>
          )}
          {editable && (
            <Button
              variant="outline"
              className="w-full"
              disabled={disabled}
              onClick={() => chooseEntry(e)}
            >
              {e.actualQuantity === null ? "นับตำแหน่งนี้" : "แก้ผลนับ"}
            </Button>
          )}
        </section>
      ))}
    </div>
  );
}
