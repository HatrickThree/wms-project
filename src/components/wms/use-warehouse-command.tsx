"use client";
import { useRef, useState } from "react";
import { ApiError, request } from "@/lib/wms";
import { Button } from "@/components/ui/button";
import { Feedback, type FeedbackValue } from "./common";
interface Command {
  path: string;
  body: Record<string, unknown>;
  key: string;
  onSuccess?: (data: any) => FeedbackValue | void;
}
export function useWarehouseCommand() {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null);
  const pending = useRef(false);
  const previous = useRef<Command | null>(null);
  const run = async (command: Command) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    previous.current = command;
    try {
      const data = await request<any>(command.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command.body, operationId: command.key }),
      });
      setUncertain(false);
      const result = command.onSuccess?.(data);
      setFeedback(
        result || {
          kind: data.status === "STALE" ? "error" : "success",
          text: data.message || "บันทึกแล้ว",
        },
      );
      previous.current = null;
      return data;
    } catch (e) {
      const unknown = !(e instanceof ApiError) || (e.status || 500) >= 500;
      setUncertain(unknown);
      setFeedback({
        kind: unknown ? "uncertain" : "error",
        text: unknown
          ? "ยังยืนยันผลไม่ได้ กดตรวจผลรายการเดิมก่อนเปลี่ยนข้อมูล ระบบจะใช้รหัสเดิมเพื่อป้องกันการบันทึกซ้ำ"
          : e.message,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    uncertain,
    feedback,
    setFeedback,
    send: (
      path: string,
      body: Record<string, unknown>,
      onSuccess?: Command["onSuccess"],
    ) => run({ path, body, key: crypto.randomUUID(), onSuccess }),
    retry: () => previous.current && run(previous.current),
    disabled: busy || uncertain,
  };
}
export function CommandFeedback({
  command,
}: {
  command: ReturnType<typeof useWarehouseCommand>;
}) {
  return (
    <div className="space-y-3">
      {command.feedback && <Feedback value={command.feedback} />}{" "}
      {command.uncertain && (
        <Button disabled={command.busy} onClick={() => void command.retry()}>
          ตรวจผลรายการเดิม
        </Button>
      )}
    </div>
  );
}
