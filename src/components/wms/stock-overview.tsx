"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, Feedback, LoadingState, EmptyState } from "./common";
import { request, locationTypeLabels } from "@/lib/wms";
import type { StockData } from "@/lib/stock-types";
export function StockOverviewScreen({
  canOperate = false,
}: {
  canOperate?: boolean;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<StockData | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    request<StockData>(`/api/stock?q=${encodeURIComponent(q)}`)
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
  }, [q, refresh]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="INVENTORY / LOTS"
        title="ยอดสต็อกและ Lot"
        description="ยอดถือครองจริงและยอดจอง แยกตาม SKU ตำแหน่ง Lot และรอบรับเข้า"
        action={
          <Button asChild>
            <Link href="/inbound">รับสินค้าเข้า</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-lg"
          aria-label="ค้นหายอดสต็อกและ Lot"
          placeholder="SKU / ชื่อสินค้า / ชั้นวาง / Lot"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>
          โหลดข้อมูลใหม่
        </Button>
        <Button asChild variant="outline">
          <Link href="/inventory">ค้นหา Serial และประวัติ</Link>
        </Button>
      </div>
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {!data ? (
        <LoadingState />
      ) : !data.layers.length ? (
        <EmptyState
          title="ยังไม่พบสต็อกคงเหลือ"
          description="ลองเปลี่ยนคำค้น หรือรับสินค้าเข้าพื้นที่นี้ก่อน"
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              พบ {data.count} รอบรับเข้าที่มียอดคงเหลือ · แสดงไม่เกิน{" "}
              {data.limit} รายการ · คงเหลืออาจรวมกักกัน/ชำรุด
              ยอดไม่จองจึงยังไม่เท่ากับยอดที่จ่ายได้ ·
              วันหมดอายุแสดงเป็นวันที่ไทย
            </p>
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    {[
                      "สินค้า",
                      "ตำแหน่ง",
                      "Lot / หมดอายุ",
                      "รับเข้า",
                      "ถือครอง",
                      "จอง",
                      "ไม่จอง",
                      ...(canOperate ? ["จัดเก็บ / ย้าย"] : []),
                    ].map((h) => (
                      <th className="p-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.layers.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="p-3">
                        <p className="font-mono font-semibold">
                          {l.product.sku}
                        </p>
                        <p>{l.product.name}</p>
                        <Badge variant="secondary">
                          {l.product.issuePolicy}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <p className="font-mono">{l.location.barcode}</p>
                        <span className="text-xs text-muted-foreground">
                          {locationTypeLabels[l.location.type] ||
                            l.location.type}
                        </span>
                      </td>
                      <td className="p-3">
                        <p>{l.lot?.number || "ไม่ระบุ Lot"}</p>
                        <p
                          className={
                            l.lot?.expiresOn && l.lot.expiresOn < data.today
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {l.lot?.expiresOn || "ไม่ระบุวันหมดอายุ"}
                        </p>
                        {l.lot?.expiresOn && l.lot.expiresOn < data.today && (
                          <Badge variant="destructive">
                            หมดอายุ · ห้ามจ่าย
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <p>{l.referenceDoc}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(l.receivedAt).toLocaleString("th-TH", {
                            timeZone: "Asia/Bangkok",
                          })}
                        </p>
                      </td>
                      <td className="p-3 font-semibold">
                        {l.qtyOnHand} {l.product.baseUom}
                      </td>
                      <td className="p-3">{l.qtyAllocated}</td>
                      <td className="p-3">{l.qtyOnHand - l.qtyAllocated}</td>
                      {canOperate && (
                        <td className="p-3">
                          <Button asChild variant="outline">
                            <Link
                              href={`/transfers?layerId=${encodeURIComponent(l.id)}`}
                            >
                              เลือกย้าย
                            </Link>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
