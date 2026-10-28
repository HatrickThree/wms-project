"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, Feedback, LoadingState, EmptyState } from "./common";
import { request } from "@/lib/wms";
interface ActivityData {
  events: {
    id: string;
    label: string;
    actor: string;
    createdAt: string;
    reference: string;
    reason: string | null;
  }[];
  count: number;
  page: number;
  pageSize: number;
}
export function ActivityScreen() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request<ActivityData>(`/api/activity?page=${page}`)
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
  }, [page]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AUDIT / ACTIVITY"
        title="บันทึกการทำงาน"
        description="ผู้ทำรายการและเวลาจากระบบ เก็บเหตุการณ์พร้อมผลที่บันทึกสำเร็จ ประวัติรุ่นก่อนยังดูได้จากการเคลื่อนไหวและ Serial"
      />
      {error && <Feedback value={{ kind: "error", text: error }} />}
      {!data ? (
        <LoadingState />
      ) : !data.events.length ? (
        <EmptyState
          title="ยังไม่มีเหตุการณ์ในบันทึกรุ่นนี้"
          description="เมื่อรับเข้า จอง หยิบ จ่าย ย้าย ตรวจนับ หรือยืนยัน ABC รายการจะแสดงที่นี่"
        />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-5">
            {data.events.map((e) => (
              <div key={e.id} className="space-y-1 border-b pb-4">
                <p className="text-sm font-semibold">
                  {e.label}{" "}
                  {e.reference && (
                    <span className="break-all font-mono">· {e.reference}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.actor} ·{" "}
                  {new Date(e.createdAt).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                </p>
                {e.reason && <p className="text-sm">{e.reason}</p>}
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {data.count} เหตุการณ์ · หน้า {page} /{" "}
                {Math.max(1, Math.ceil(data.count / data.pageSize))}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="outline"
                  disabled={page * data.pageSize >= data.count}
                  onClick={() => setPage(page + 1)}
                >
                  ถัดไป
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
