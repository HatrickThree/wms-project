"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, Feedback, LoadingState, EmptyState } from "./common";
import { useUnsavedChanges } from "@/components/layout/navigation-guard";
import { request, locationTypeLabels } from "@/lib/wms";
import type { CatalogData, CatalogProduct } from "@/lib/stock-types";

const blankProduct = {
  sku: "",
  barcode: "",
  name: "",
  category: "",
  baseUom: "ชิ้น",
  minStock: 0,
  trackSerial: true,
  trackLot: false,
  issuePolicy: "FIFO" as "FIFO" | "FEFO",
};
const selectClass =
  "h-12 w-full rounded-lg border border-input bg-background px-3 text-sm";
export function MasterDataScreen() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [kind, setKind] = useState<"product" | "warehouse" | "location" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState("");
  const [product, setProduct] = useState(blankProduct);
  const [warehouse, setWarehouse] = useState({ code: "", name: "" });
  const [location, setLocation] = useState({
    warehouseId: "",
    barcode: "",
    zone: "",
    aisle: "",
    rack: "",
    level: "",
    type: "STORAGE",
  });
  useUnsavedChanges(!!kind);
  useEffect(() => {
    let active = true;
    request<CatalogData>(`/api/catalog?q=${encodeURIComponent(q)}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [q, refresh]);
  const edit = (p: CatalogProduct) => {
    setEditing(p.id);
    setProduct({ ...p, category: p.category || "" });
    setKind("product");
    setError("");
  };
  const start = (next: typeof kind) => {
    setEditing("");
    setProduct(blankProduct);
    setWarehouse({ code: "", name: "" });
    setLocation({
      warehouseId: data?.warehouses[0]?.id || "",
      barcode: "",
      zone: "",
      aisle: "",
      rack: "",
      level: "",
      type: "STORAGE",
    });
    setError("");
    setKind(next);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/catalog", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ...(kind === "product"
            ? product
            : kind === "warehouse"
              ? warehouse
              : location),
          ...(editing ? { id: editing } : {}),
        }),
      });
      setKind(null);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ยังบันทึกไม่ได้");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SETUP / CATALOG"
        title="สินค้า คลัง และตำแหน่ง"
        description="จัดการข้อมูลหลักในพื้นที่ปัจจุบัน การสร้างข้อมูลหลักยังไม่เพิ่มยอดสต็อก"
      />
      {error && !kind && <Feedback value={{ kind: "error", text: error }} />}
      <div className="flex gap-2">
        <Input
          aria-label="ค้นหาข้อมูลหลัก"
          placeholder="ค้นหา SKU ชื่อสินค้า หรือชั้นวาง"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          variant="outline"
          aria-label="โหลดข้อมูลใหม่"
          onClick={() => setRefresh((v) => v + 1)}
        >
          <RefreshCw />
        </Button>
      </div>
      {!data ? (
        <LoadingState />
      ) : (
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">สินค้า</TabsTrigger>
            <TabsTrigger value="warehouses">คลังสินค้า</TabsTrigger>
            <TabsTrigger value="locations">ตำแหน่ง</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>สินค้า · {data.productCount} SKU</CardTitle>
                <Button onClick={() => start("product")}>
                  <Plus />
                  เพิ่มสินค้า
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  แสดงไม่เกิน {data.limit} รายการตามคำค้น ·
                  สินค้าที่มีประวัติแล้วเปลี่ยนรหัส หน่วยหลัก และการคุม Serial
                  ไม่ได้
                </p>
                {!data.products.length ? (
                  <EmptyState
                    title="ยังไม่มีสินค้า"
                    description="เพิ่ม SKU ก่อนรับสินค้าเข้า"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="p-3">SKU / สินค้า</th>
                          <th className="p-3">หน่วยหลัก</th>
                          <th className="p-3">การควบคุม</th>
                          <th className="p-3">ลำดับจ่าย</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.products.map((p) => (
                          <tr key={p.id} className="border-b">
                            <td className="p-3">
                              <p className="font-mono font-medium">{p.sku}</p>
                              <p>{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.barcode}
                              </p>
                            </td>
                            <td className="p-3">{p.baseUom}</td>
                            <td className="p-3">
                              {p.trackSerial ? "Serial" : "จำนวน"}
                              {p.trackLot ? " + Lot" : ""}
                            </td>
                            <td className="p-3">{p.issuePolicy}</td>
                            <td>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`แก้ไข ${p.sku}`}
                                onClick={() => edit(p)}
                              >
                                <Pencil />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="warehouses">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>คลังสินค้า</CardTitle>
                <Button onClick={() => start("warehouse")}>
                  <Plus />
                  เพิ่มคลัง
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.warehouses.map((w) => (
                  <div key={w.id} className="rounded-lg border p-4">
                    <p className="font-mono font-semibold">{w.code}</p>
                    <p>{w.name}</p>
                  </div>
                ))}
                {!data.warehouses.length && (
                  <EmptyState
                    title="ยังไม่มีคลัง"
                    description="สร้างคลังก่อนเพิ่มตำแหน่งจัดเก็บ"
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="locations">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>ตำแหน่ง · {data.locationCount} รายการ</CardTitle>
                <Button
                  disabled={!data.warehouses.length}
                  onClick={() => start("location")}
                >
                  <Plus />
                  เพิ่มตำแหน่ง
                </Button>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  แสดงไม่เกิน {data.limit} รายการตามคำค้น
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {data.locations.map((l) => (
                    <div key={l.id} className="rounded-lg border p-4">
                      <p className="font-mono font-semibold">{l.barcode}</p>
                      <p className="text-sm">
                        {l.warehouse.name} ·{" "}
                        {locationTypeLabels[l.type] || l.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        โซน {l.zone} / แถว {l.aisle} / ชั้น {l.level}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      <Dialog
        open={!!kind}
        onOpenChange={(open) => {
          if (!open && !busy) setKind(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>
            {editing
              ? "แก้ไขสินค้า"
              : kind === "product"
                ? "เพิ่มสินค้า"
                : kind === "warehouse"
                  ? "เพิ่มคลังสินค้า"
                  : "เพิ่มตำแหน่ง"}
          </DialogTitle>
          <DialogDescription>
            บันทึกในพื้นที่ปัจจุบัน โดยไม่เปลี่ยนยอดสต็อก
          </DialogDescription>
          <form className="space-y-4" onSubmit={submit}>
            <fieldset disabled={busy} className="space-y-4">
              {kind === "product" && (
                <>
                  {(
                    [
                      ["sku", "SKU"],
                      ["barcode", "บาร์โค้ดสินค้า"],
                      ["name", "ชื่อสินค้า"],
                      ["category", "หมวดหมู่"],
                      ["baseUom", "หน่วยหลัก"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="field-group" key={key}>
                      <Label htmlFor={`master-${key}`}>{label}</Label>
                      <Input
                        id={`master-${key}`}
                        value={product[key]}
                        onChange={(e) =>
                          setProduct({ ...product, [key]: e.target.value })
                        }
                        required={key !== "category"}
                      />
                    </div>
                  ))}
                  <div className="field-group">
                    <Label htmlFor="master-min">จุดเตือนขั้นต่ำ</Label>
                    <Input
                      id="master-min"
                      type="number"
                      min="0"
                      step="1"
                      value={product.minStock}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          minStock: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <label className="flex min-h-10 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={product.trackSerial}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          trackSerial: e.target.checked,
                        })
                      }
                    />
                    ควบคุม Serial รายชิ้น
                  </label>
                  <label className="flex min-h-10 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={product.trackLot}
                      onChange={(e) =>
                        setProduct({ ...product, trackLot: e.target.checked })
                      }
                    />
                    ต้องระบุ Lot
                  </label>
                  <div className="field-group">
                    <Label htmlFor="master-policy">ลำดับการจ่าย</Label>
                    <select
                      id="master-policy"
                      className={selectClass}
                      value={product.issuePolicy}
                      onChange={(e) =>
                        setProduct({
                          ...product,
                          issuePolicy: e.target.value as "FIFO" | "FEFO",
                        })
                      }
                    >
                      <option value="FIFO">FIFO · รับก่อนจ่ายก่อน</option>
                      <option value="FEFO">FEFO · หมดอายุก่อนจ่ายก่อน</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      FEFO ต้องมี Lot และวันหมดอายุทุกครั้งที่รับเข้า
                    </p>
                  </div>
                </>
              )}
              {kind === "warehouse" &&
                (["code", "name"] as const).map((key) => (
                  <div className="field-group" key={key}>
                    <Label htmlFor={`warehouse-${key}`}>
                      {key === "code" ? "รหัสคลัง" : "ชื่อคลัง"}
                    </Label>
                    <Input
                      id={`warehouse-${key}`}
                      required
                      value={warehouse[key]}
                      onChange={(e) =>
                        setWarehouse({ ...warehouse, [key]: e.target.value })
                      }
                    />
                  </div>
                ))}
              {kind === "location" && (
                <>
                  <div className="field-group">
                    <Label htmlFor="location-warehouse">คลังสินค้า</Label>
                    <select
                      id="location-warehouse"
                      className={selectClass}
                      value={location.warehouseId}
                      onChange={(e) =>
                        setLocation({
                          ...location,
                          warehouseId: e.target.value,
                        })
                      }
                    >
                      {data?.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} · {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(
                    [
                      ["barcode", "รหัสตำแหน่ง"],
                      ["zone", "โซน"],
                      ["aisle", "แถว"],
                      ["rack", "ตู้/แร็ค"],
                      ["level", "ชั้น"],
                    ] as const
                  ).map(([key, label]) => (
                    <div className="field-group" key={key}>
                      <Label htmlFor={`location-${key}`}>{label}</Label>
                      <Input
                        id={`location-${key}`}
                        required
                        value={location[key]}
                        onChange={(e) =>
                          setLocation({ ...location, [key]: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div className="field-group">
                    <Label htmlFor="location-type">ประเภทตำแหน่ง</Label>
                    <select
                      id="location-type"
                      className={selectClass}
                      value={location.type}
                      onChange={(e) =>
                        setLocation({ ...location, type: e.target.value })
                      }
                    >
                      {[
                        ["RECEIVING", "พักรับเข้า"],
                        ["STORAGE", "จัดเก็บ"],
                        ["PICKING", "หยิบ"],
                        ["PACKING", "แพ็ค"],
                        ["QUARANTINE", "กักกัน"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {error && <Feedback value={{ kind: "error", text: error }} />}
              <Button type="submit" className="w-full">
                {busy ? "กำลังบันทึก…" : "บันทึกข้อมูลหลัก"}
              </Button>
            </fieldset>
          </form>
          {kind === "product" && editing && (
            <UnitEditor
              productId={editing}
              baseUom={product.baseUom}
              units={data?.products.find((p) => p.id === editing)?.units || []}
              onSaved={() => setRefresh((v) => v + 1)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnitEditor({
  productId,
  baseUom,
  units,
  onSaved,
}: {
  productId: string;
  baseUom: string;
  units: { id: string; name: string; factor: number }[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [factor, setFactor] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">หน่วยบรรจุและอัตราแปลง</h3>
      <p className="text-xs text-muted-foreground">
        เพิ่มหลังบันทึกสินค้า · อัตราของหน่วยที่เพิ่มแล้วคงเดิม
        เพื่อรักษาความหมายของรหัสหน่วยและประวัติ
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          1 {baseUom} = 1 {baseUom} (หน่วยหลัก)
        </li>
        {units.map((u) => (
          <li key={u.id}>
            1 {u.name} = {u.factor} {baseUom}
          </li>
        ))}
      </ul>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await request("/api/catalog/units", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId, name, factor }),
            });
            setName("");
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "เพิ่มหน่วยไม่ได้");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="field-group">
            <Label htmlFor="unit-name">ชื่อหน่วย เช่น กล่อง</Label>
            <Input
              id="unit-name"
              required
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field-group">
            <Label htmlFor="unit-factor">จำนวน {baseUom} ต่อหน่วย</Label>
            <Input
              id="unit-factor"
              type="number"
              required
              min="1"
              step="1"
              value={factor}
              disabled={busy}
              onChange={(e) => setFactor(Number(e.target.value))}
            />
          </div>
        </div>
        {error && <Feedback value={{ kind: "error", text: error }} />}
        <Button type="submit" variant="outline" disabled={busy || !name.trim()}>
          {busy ? "กำลังเพิ่ม…" : "เพิ่มหน่วยบรรจุ"}
        </Button>
      </form>
    </section>
  );
}
