"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Route, Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState, Feedback, LoadingState } from "./common";
import { useWarehouseCommand, CommandFeedback } from "./use-warehouse-command";
import {
  useUnsavedChanges,
  useGuardedAction,
} from "@/components/layout/navigation-guard";
import { request } from "@/lib/wms";
import {
  MapGraphSchema,
  type MapGraph,
  type RouteResult,
} from "@/lib/warehouse-map";

interface Plan {
  id: string;
  orderId: string;
  mapVersion: number;
  createdBy: string;
  createdAt: string;
  snapshot: {
    graph: MapGraph;
    orderNumber: string;
    items: {
      allocationId: string;
      sku: string;
      quantity: number;
      uom: string;
      locationId: string;
      locationBarcode: string;
      serialNumber: string | null;
    }[];
  };
  result: RouteResult;
}
interface Data {
  warehouses: { id: string; code: string; name: string }[];
  warehouseId: string;
  locations: { id: string; barcode: string; type: string }[];
  map: { version: number; graph: MapGraph; updatedBy: string } | null;
  orders: { id: string; number: string; status: string }[];
  plans: Plan[];
}
const selectClass = "h-12 w-full rounded-lg border bg-background px-3 text-sm";
export function MapDrawing({
  graph,
  result,
}: {
  graph: MapGraph;
  result?: RouteResult;
}) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const points = result?.path
    .map((id) => nodes.get(id))
    .filter((n) => !!n)
    .map((n) => `${n.x},${n.y}`)
    .join(" ");
  return (
    <div className="overflow-auto rounded-xl border bg-slate-50 p-3">
      <svg
        role="img"
        aria-label={`ผังจำลอง ${graph.name}${result ? ` เส้นทาง ${result.distanceMeters} เมตร` : ""}`}
        viewBox={`-1 -1 ${graph.width + 2} ${graph.height + 2}`}
        className="mx-auto max-h-[520px] min-h-64 min-w-[220px] w-full"
      >
        <defs>
          <marker
            id="map-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L5,2.5 L0,5" fill="#94a3b8" />
          </marker>
        </defs>
        <rect
          x="0"
          y="0"
          width={graph.width}
          height={graph.height}
          rx="0.3"
          fill="white"
          stroke="#cbd5e1"
          strokeWidth="0.08"
        />
        {graph.edges.map((e, i) => {
          const a = nodes.get(e.from),
            b = nodes.get(e.to);
          return a && b ? (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#cbd5e1"
              strokeWidth="0.18"
              markerEnd={e.bidirectional ? undefined : "url(#map-arrow)"}
            />
          ) : null;
        })}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke="#2563eb"
            strokeWidth="0.14"
            strokeDasharray="0.3 0.15"
          />
        )}
        {graph.nodes.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.kind === "WAYPOINT" ? 0.16 : 0.3}
              fill={
                n.kind === "START"
                  ? "#059669"
                  : n.kind === "END"
                    ? "#e11d48"
                    : n.kind === "LOCATION"
                      ? "#2563eb"
                      : "#64748b"
              }
            />
            <text
              x={n.x}
              y={n.y - 0.48}
              textAnchor="middle"
              fontSize="0.38"
              fill="#334155"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
export function WarehouseMapScreen({
  canEdit,
  canPlan,
}: {
  canEdit: boolean;
  canPlan: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<MapGraph | null>(null);
  const [editing, setEditing] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [planId, setPlanId] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const command = useWarehouseCommand();
  const guarded = useGuardedAction();
  useUnsavedChanges(editing || command.uncertain);
  useEffect(() => {
    let active = true;
    request<Data>(
      `/api/maps${warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : ""}`,
    )
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [warehouseId, refresh]);
  const reload = () => setRefresh((r) => r + 1);
  const graph = editing ? draft : data?.map?.graph;
  const plan = data?.plans.find((p) => p.id === planId);
  const patchNode = (id: string, patch: Partial<MapGraph["nodes"][number]>) =>
    setDraft((g) =>
      g
        ? {
            ...g,
            nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
          }
        : g,
    );
  const suggest = async () => {
    if (!data) return;
    setError("");
    try {
      const g = await request<MapGraph>("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "suggest",
          warehouseId: data.warehouseId,
        }),
      });
      setDraft(g);
      setEditing(true);
      setPlanId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างผังไม่ได้");
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LAYOUT / PICKING ROUTE"
        title="ผังคลังและเส้นทางหยิบ"
        description="กำหนดจุดและทางเดินในผังจำลอง เส้นทางอ้างอิงรายการที่จองไว้และยังไม่หยิบ ระยะทางเป็นค่าคำนวณจากผัง"
        action={
          <Link href="/outbound">
            <Button variant="outline">คำสั่งซื้อ / หยิบสินค้า</Button>
          </Link>
        }
      />
      <CommandFeedback command={command} />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {!data ? (
        <LoadingState />
      ) : !data.warehouses.length ? (
        <EmptyState
          title="ยังไม่มีคลัง"
          description="เพิ่มคลังและตำแหน่งก่อนจัดผัง"
          action={
            <Link href="/catalog">
              <Button>ข้อมูลหลัก</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="field-group min-w-48 flex-1">
              <Label htmlFor="map-warehouse">คลังสินค้า</Label>
              <select
                id="map-warehouse"
                className={selectClass}
                value={data.warehouseId}
                disabled={command.disabled}
                onChange={(e) => {
                  const nextWarehouse = e.target.value;
                  guarded(() => {
                    setEditing(false);
                    setDraft(null);
                    setData(null);
                    setWarehouseId(nextWarehouse);
                    setPlanId("");
                    setOrderId("");
                  });
                }}
              >
                {data.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              disabled={command.disabled}
              onClick={() =>
                guarded(() => {
                  setEditing(false);
                  setDraft(null);
                  reload();
                })
              }
            >
              โหลดข้อมูลใหม่
            </Button>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>
                    <MapPin className="mr-2 inline size-5" />
                    {plan
                      ? `ผังที่บันทึกกับ ${plan.snapshot.orderNumber}`
                      : graph?.name || "ยังไม่ได้บันทึกผัง"}
                  </CardTitle>
                  <Badge variant="secondary">
                    จำลอง · รุ่น{" "}
                    {plan?.mapVersion || data.map?.version || "ร่าง"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan ? (
                  <MapDrawing
                    graph={plan.snapshot.graph}
                    result={plan.result}
                  />
                ) : graph ? (
                  <MapDrawing graph={graph} />
                ) : (
                  <EmptyState
                    title="เริ่มวางผังคลัง"
                    description="สร้างผังเสนอจากตำแหน่งเดิม แล้วตรวจพิกัดและทางเดินก่อนบันทึก ไม่มีการย้ายสินค้าอัตโนมัติ"
                  />
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  จุดเขียว = เริ่ม · แดง = จบ · น้ำเงิน = ตำแหน่ง · เส้นเทา =
                  ทางเดินที่อนุญาต · ผังไม่ใช่แบบอาคารจริง
                  ทางเดินต้องไม่ตัดผ่านชั้นวางหรือสิ่งกีดขวางที่หน้างาน
                </p>
                {canEdit && !editing && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={command.disabled}
                      onClick={() => void suggest()}
                    >
                      <Plus />
                      สร้างผังเสนอใหม่
                    </Button>
                    {data.map && (
                      <Button
                        disabled={command.disabled}
                        onClick={() => {
                          setDraft(structuredClone(data.map!.graph));
                          setEditing(true);
                          setPlanId("");
                        }}
                      >
                        แก้ไขผังปัจจุบัน
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>
                  <Route className="mr-2 inline size-5" />
                  เส้นทางหยิบตามคำสั่งซื้อ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="field-group">
                  <Label htmlFor="map-order">
                    คำสั่งซื้อที่จองแล้ว (ล่าสุด 100)
                  </Label>
                  <select
                    id="map-order"
                    className={selectClass}
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    disabled={command.disabled || editing}
                  >
                    <option value="">เลือกคำสั่งซื้อ</option>
                    {data.orders.map((o) => (
                      <option value={o.id} key={o.id}>
                        {o.number}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  className="w-full"
                  disabled={
                    !canPlan ||
                    !data.map ||
                    !orderId ||
                    command.disabled ||
                    editing
                  }
                  onClick={() =>
                    void command.send(
                      "/api/maps",
                      {
                        action: "route",
                        warehouseId: data.warehouseId,
                        orderId,
                        expectedVersion: data.map!.version,
                      },
                      (d) => {
                        setPlanId(d.id);
                        reload();
                      },
                    )
                  }
                >
                  คำนวณและเก็บแผนเส้นทาง
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  เริ่มที่จุดเริ่ม เลือกจุดหยิบที่ใกล้ที่สุดตามทางเดินทีละจุด
                  แล้วไปจุดจบ ใช้ Dijkstra ระหว่างจุด เป็นเส้นทางเสนอ
                  ไม่รับรองว่าสั้นที่สุดทั้งรายการ แยกคำนวณทีละคลัง
                  การคำนวณไม่จอง หยิบ หรือจ่ายสินค้า
                </p>
                <div className="field-group">
                  <Label htmlFor="map-history">แผนที่เก็บไว้ (ล่าสุด 20)</Label>
                  <select
                    id="map-history"
                    className={selectClass}
                    value={planId}
                    disabled={editing}
                    onChange={(e) => setPlanId(e.target.value)}
                  >
                    <option value="">แสดงผังปัจจุบัน</option>
                    {data.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.snapshot.orderNumber} · รุ่น {p.mapVersion} ·{" "}
                        {new Date(p.createdAt).toLocaleString("th-TH", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </option>
                    ))}
                  </select>
                </div>
                {plan && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-blue-50 p-4">
                      <p className="text-sm text-slate-600">
                        ระยะทางคำนวณจากผังที่บันทึกไว้
                      </p>
                      <p className="mt-1 text-3xl font-semibold text-primary">
                        {plan.result.distanceMeters.toFixed(2)}{" "}
                        <span className="text-sm">เมตร</span>
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        {plan.result.stops.length} จุดหยิบ · โดย{" "}
                        {plan.createdBy} · ข้อมูลขณะสร้างแผน
                      </p>
                    </div>
                    {plan.mapVersion !== data.map?.version && (
                      <p className="text-sm text-amber-700">
                        ผังปัจจุบันเปลี่ยนรุ่นแล้ว
                        แผนนี้เก็บผังเดิมไว้เพื่ออ้างอิง
                      </p>
                    )}
                    <ol className="space-y-3">
                      {plan.result.stops.map((s, i) => (
                        <li key={s.nodeId} className="rounded-lg border p-3">
                          <p className="font-medium">
                            {i + 1}. {s.label}
                          </p>
                          {plan.snapshot.items
                            .filter((it) => it.locationId === s.locationId)
                            .map((it) => (
                              <p
                                key={it.allocationId}
                                className="mt-1 break-words text-sm text-muted-foreground"
                              >
                                {it.sku} · {it.quantity} {it.uom}
                                {it.serialNumber
                                  ? ` · S/N ${it.serialNumber}`
                                  : ""}
                              </p>
                            ))}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          {editing && draft && (
            <Card>
              <CardHeader>
                <CardTitle>แก้ไขผังจำลองก่อนบันทึก</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <fieldset
                  disabled={command.disabled}
                  className="min-w-0 space-y-5"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="field-group">
                      <Label htmlFor="map-name">ชื่อผัง</Label>
                      <Input
                        id="map-name"
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                    </div>
                    {(
                      [
                        ["width", "ความกว้าง (หน่วยผัง)"],
                        ["height", "ความสูง (หน่วยผัง)"],
                        ["metersPerUnit", "เมตรต่อหนึ่งหน่วยผัง"],
                      ] as const
                    ).map(([k, label]) => (
                      <div className="field-group" key={k}>
                        <Label htmlFor={`map-${k}`}>{label}</Label>
                        <Input
                          id={`map-${k}`}
                          type="number"
                          min={k === "metersPerUnit" ? 0.01 : 4}
                          step="any"
                          value={draft[k]}
                          onChange={(e) =>
                            setDraft({ ...draft, [k]: Number(e.target.value) })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ปรับตำแหน่งจุดและเชื่อมเฉพาะทางเดินที่ใช้ได้
                    หากต้องเดินอ้อมให้เพิ่มจุดทางเดิน ไม่ลากเส้นผ่านชั้นวาง
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {draft.nodes.map((n) => (
                      <div
                        className="space-y-2 rounded-xl border p-3"
                        key={n.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-sm">
                            {n.kind === "START"
                              ? "เริ่ม"
                              : n.kind === "END"
                                ? "จบ"
                                : n.kind === "LOCATION"
                                  ? "ตำแหน่ง"
                                  : "ทางเดิน"}
                          </strong>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`ลบจุด ${n.label}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                nodes: draft.nodes.filter((x) => x.id !== n.id),
                                edges: draft.edges.filter(
                                  (e) => e.from !== n.id && e.to !== n.id,
                                ),
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <Input
                          aria-label={`ชื่อจุด ${n.id}`}
                          value={n.label}
                          onChange={(e) =>
                            patchNode(n.id, { label: e.target.value })
                          }
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            step="any"
                            aria-label={`พิกัด X ${n.id}`}
                            value={n.x}
                            onChange={(e) =>
                              patchNode(n.id, { x: Number(e.target.value) })
                            }
                          />
                          <Input
                            type="number"
                            step="any"
                            aria-label={`พิกัด Y ${n.id}`}
                            value={n.y}
                            onChange={(e) =>
                              patchNode(n.id, { y: Number(e.target.value) })
                            }
                          />
                        </div>
                        {n.kind === "LOCATION" && (
                          <select
                            aria-label={`ตำแหน่งของจุด ${n.id}`}
                            className={selectClass}
                            value={n.locationId || ""}
                            onChange={(e) =>
                              patchNode(n.id, { locationId: e.target.value })
                            }
                          >
                            <option value="">เลือกตำแหน่ง</option>
                            {data.locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.barcode}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["WAYPOINT", "เพิ่มจุดทางเดิน"],
                        ["LOCATION", "เพิ่มจุดตำแหน่ง"],
                        ["START", "เพิ่มจุดเริ่ม"],
                        ["END", "เพิ่มจุดจบ"],
                      ] as const
                    ).map(([kind, label]) => (
                      <Button
                        key={kind}
                        variant="outline"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            nodes: [
                              ...draft.nodes,
                              {
                                id: crypto.randomUUID(),
                                label: label.replace("เพิ่มจุด", ""),
                                kind,
                                x: 1,
                                y: 1,
                                ...(kind === "LOCATION"
                                  ? { locationId: "" }
                                  : {}),
                              },
                            ],
                          })
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <h3 className="font-medium">ทางเดินระหว่างจุด</h3>
                  {draft.edges.map((e, i) => (
                    <div
                      key={i}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                    >
                      {(["from", "to"] as const).map((k) => (
                        <select
                          className={selectClass}
                          aria-label={`${k === "from" ? "จาก" : "ไป"} ทางเดิน ${i + 1}`}
                          value={e[k]}
                          key={k}
                          onChange={(ev) =>
                            setDraft({
                              ...draft,
                              edges: draft.edges.map((edge, j) =>
                                i === j
                                  ? { ...edge, [k]: ev.target.value }
                                  : edge,
                              ),
                            })
                          }
                        >
                          {draft.nodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.label}
                            </option>
                          ))}
                        </select>
                      ))}
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={e.bidirectional}
                          onChange={(ev) =>
                            setDraft({
                              ...draft,
                              edges: draft.edges.map((edge, j) =>
                                i === j
                                  ? {
                                      ...edge,
                                      bidirectional: ev.target.checked,
                                    }
                                  : edge,
                              ),
                            })
                          }
                        />
                        สองทิศทาง
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`ลบทางเดิน ${i + 1}`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            edges: draft.edges.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    disabled={draft.nodes.length < 2}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        edges: [
                          ...draft.edges,
                          {
                            from: draft.nodes[0].id,
                            to: draft.nodes[1].id,
                            bidirectional: true,
                          },
                        ],
                      })
                    }
                  >
                    เพิ่มทางเดิน
                  </Button>
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button
                      disabled={command.disabled}
                      onClick={() => {
                        const parsed = MapGraphSchema.safeParse(draft);
                        if (!parsed.success) {
                          setError(parsed.error.issues[0].message);
                          return;
                        }
                        setError("");
                        setConfirmSave(true);
                      }}
                    >
                      <Save />
                      ทบทวนก่อนบันทึก
                    </Button>
                    <Button
                      variant="outline"
                      disabled={command.disabled}
                      onClick={() =>
                        guarded(() => {
                          setEditing(false);
                          setDraft(null);
                        })
                      }
                    >
                      ยกเลิกการแก้ไข
                    </Button>
                  </div>
                </fieldset>
              </CardContent>
            </Card>
          )}
          <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
            <DialogContent>
              <DialogTitle>ยืนยันผังจำลองรุ่นใหม่</DialogTitle>
              <CommandFeedback command={command} />
              <DialogDescription>
                ตรวจว่าพิกัด ทางเดิน และสเกลตรงกับผังที่ต้องการ
                ผังนี้ใช้เสนอเส้นทางและคำนวณระยะ
                แผนที่เก็บไว้ก่อนหน้านี้จะอ้างอิงผังเดิม
              </DialogDescription>
              <p className="text-sm">
                {draft?.name} · {draft?.nodes.length} จุด ·{" "}
                {draft?.edges.length} ทางเดิน · {draft?.metersPerUnit}{" "}
                เมตร/หน่วย
              </p>
              <Button
                disabled={command.disabled}
                onClick={() =>
                  void command.send(
                    "/api/maps",
                    {
                      action: "save",
                      warehouseId: data.warehouseId,
                      expectedVersion: data.map?.version || 0,
                      graph: draft,
                    },
                    () => {
                      setConfirmSave(false);
                      setEditing(false);
                      setDraft(null);
                      reload();
                    },
                  )
                }
              >
                ยืนยันบันทึกผัง
              </Button>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
