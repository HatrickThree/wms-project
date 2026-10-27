"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Camera, ImageUp, ScanLine, Square, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BusyLabel, Feedback } from "./common";

type Phase = "idle" | "starting" | "scanning" | "decoding" | "processing";

function cameraMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : String(error);
  if (/NotAllowed|Permission|permission|denied/i.test(name))
    return "ยังไม่ได้รับอนุญาตให้ใช้กล้อง เปิดสิทธิ์กล้องในเบราว์เซอร์ หรือเลือกอ่านจากภาพแทน";
  if (/NotFound|DevicesNotFound/i.test(name))
    return "ไม่พบกล้องบนอุปกรณ์นี้ เลือกอ่านจากภาพหรือพิมพ์รหัสเองได้";
  if (/NotReadable|TrackStart|Could not start/i.test(name))
    return "เปิดกล้องไม่ได้ กล้องอาจถูกใช้งานอยู่ ลองปิดแอปที่ใช้กล้องแล้วเปิดใหม่";
  return "เปิดกล้องไม่ได้ กรุณาตรวจสิทธิ์และการเชื่อมต่อ หรือลองอ่านรหัสจากภาพแทน";
}

export function CameraScanner({
  onScan,
  disabled,
  title = "สแกน QR / บาร์โค้ด",
  focusTarget,
}: {
  onScan: (value: string) => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  focusTarget?: string;
}) {
  const elementId = `camera-reader-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const scanner = useRef<Html5Qrcode | null>(null);
  const setup = useRef<Promise<void> | null>(null);
  const session = useRef(0);
  const openRef = useRef(false);
  const delivered = useRef(false);
  const actionPending = useRef(false);
  const cleanup = useRef<Promise<void>>(Promise.resolve());

  const release = useCallback(() => {
    session.current += 1;
    const current = scanner.current;
    const pending = setup.current;
    // Capture tracks while the dialog still exists; its DOM may be gone by teardown.
    const streams = Array.from(document.getElementById(elementId)?.querySelectorAll("video") || [])
      .map((video) => video.srcObject)
      .filter((stream): stream is MediaStream => stream instanceof MediaStream);
    scanner.current = null;
    setup.current = null;
    cleanup.current = cleanup.current
      .catch(() => {})
      .then(async () => {
        await pending?.catch(() => {});
        if (current) {
          try {
            if (current.isScanning) await current.stop();
          } finally {
            current.clear();
          }
        }
      })
      .catch(() => {
        // Also stop live tracks when the decoder's own teardown fails.
        const container = document.getElementById(elementId);
        container?.querySelectorAll("video").forEach((video) => {
          const stream = video.srcObject;
          if (stream instanceof MediaStream)
            stream.getTracks().forEach((track) => track.stop());
        });
      }).finally(() => {
        streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      });
    return cleanup.current;
  }, [elementId]);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        void release();
        setPhase("idle");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      openRef.current = false;
      void release();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [release]);

  const changeOpen = (value: boolean) => {
    openRef.current = value;
    setOpen(value);
    if (!value) {
      void release();
      setPhase("idle");
    } else {
      setError(null);
      delivered.current = false;
    }
  };

  const deliver = async (value: string) => {
    if (delivered.current || !openRef.current) return;
    delivered.current = true;
    setPhase("processing");
    await release();
    if (!openRef.current) return;
    try {
      const code = value.trim();
      if (!code || code.length > 256)
        throw new Error("รหัสว่างหรือยาวเกินไป กรุณาตรวจสอบป้าย");
      await onScan(code);
      changeOpen(false);
    } catch (failure) {
      if (openRef.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "ใช้รหัสนี้ไม่ได้ กรุณาตรวจสอบป้าย",
        );
        delivered.current = false;
        setPhase("idle");
      }
    }
  };

  const createScanner = async (token: number) => {
    const { Html5Qrcode: Decoder, Html5QrcodeSupportedFormats: Formats } =
      await import("html5-qrcode");
    if (token !== session.current || !openRef.current) return null;
    const instance = new Decoder(elementId, {
      verbose: false,
      formatsToSupport: [
        Formats.QR_CODE,
        Formats.CODE_128,
        Formats.CODE_39,
        Formats.EAN_13,
        Formats.EAN_8,
        Formats.UPC_A,
        Formats.UPC_E,
        Formats.DATA_MATRIX,
      ],
    });
    scanner.current = instance;
    return instance;
  };

  const startCamera = async () => {
    if (actionPending.current || phase !== "idle") return;
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "กล้องต้องเปิดเว็บผ่าน HTTPS หรือ localhost บนอุปกรณ์นี้ หากใช้มือถือผ่าน IP ภายใน ให้เลือกอ่านจากภาพหรือใช้เครื่องสแกนไปก่อนได้",
      );
      return;
    }
    actionPending.current = true;
    setPhase("starting");
    await cleanup.current;
    const token = ++session.current;
    delivered.current = false;
    const starting = (async () => {
      const instance = await createScanner(token);
      if (!instance) return;
      await instance.start(
        { facingMode: { ideal: "environment" } },
        { fps: 8 },
        (code) => {
          if (token === session.current) void deliver(code);
        },
        () => {},
      );
      if (token === session.current && openRef.current) setPhase("scanning");
    })();
    setup.current = starting;
    try {
      await starting;
    } catch (failure) {
      if (token === session.current && openRef.current) {
        setError(cameraMessage(failure));
        setPhase("idle");
      }
      await release();
    } finally {
      actionPending.current = false;
    }
  };

  const scanImage = async (file: File) => {
    if (actionPending.current || !openRef.current) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("ภาพใหญ่เกิน 15 MB กรุณาเลือกภาพขนาดเล็กลง");
      return;
    }
    actionPending.current = true;
    setError(null);
    setPhase("decoding");
    await release();
    const token = ++session.current;
    delivered.current = false;
    try {
      const instance = await createScanner(token);
      if (!instance) return;
      const code = await instance.scanFile(file, false);
      if (token === session.current && openRef.current) await deliver(code);
    } catch {
      if (token === session.current && openRef.current) {
        setError(
          "ยังอ่าน QR / บาร์โค้ดจากภาพนี้ไม่ได้ ลองใช้ภาพชัดขึ้นและให้เห็นรหัสครบทั้งกรอบ หรือพิมพ์รหัสเอง",
        );
        setPhase("idle");
      }
    } finally {
      actionPending.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          className="h-12 w-12 shrink-0"
          aria-label={title}
          title={title}
        >
          <Camera />
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (focusTarget) {
            event.preventDefault();
            document.getElementById(focusTarget)?.focus();
          }
        }}
      >
        <div className="space-y-2 pr-10">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <ScanLine className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            อ่านรหัสเพื่อใส่ในช่องกรอกเท่านั้น ยังไม่บันทึกรับเข้าหรือจ่ายสินค้า
          </DialogDescription>
        </div>
        <div
          id={elementId}
          className="min-h-48 overflow-hidden rounded-xl border bg-slate-950/5 [&_video]:!w-full"
          aria-label="ภาพจากกล้องสำหรับสแกน"
        />
        {error && <Feedback value={{ kind: "error", text: error }} />}
        <div aria-live="polite" className="text-sm text-muted-foreground">
          {phase === "starting"
            ? "กำลังเปิดกล้อง โปรดตรวจคำขอสิทธิ์ของเบราว์เซอร์"
            : phase === "scanning"
              ? "เล็ง QR / บาร์โค้ดให้อยู่ในภาพ เมื่ออ่านได้กล้องจะหยุด"
              : phase === "decoding"
                ? "กำลังอ่านรหัสจากภาพ…"
                : phase === "processing"
                  ? "อ่านรหัสแล้ว กำลังตรวจสอบ…"
                  : "เลือกเปิดกล้อง หรืออ่านรหัสจากภาพบนอุปกรณ์"}
        </div>
        {phase === "scanning" ? (
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await release();
              setPhase("idle");
            }}
          >
            <Square />
            หยุดกล้อง
          </Button>
        ) : (
          <Button
            type="button"
            onClick={startCamera}
            disabled={phase !== "idle"}
          >
            {phase === "starting" ? (
              <BusyLabel>กำลังเปิดกล้อง…</BusyLabel>
            ) : (
              <>
                <Camera />
                เปิดกล้อง
              </>
            )}
          </Button>
        )}
        <div className="space-y-2 rounded-lg border p-3">
          <Label
            htmlFor={`${elementId}-file`}
            className="flex items-center gap-2"
          >
            <ImageUp className="size-4" />
            อ่านจากภาพ QR / บาร์โค้ด
          </Label>
          <Input
            id={`${elementId}-file`}
            type="file"
            accept="image/*"
            disabled={phase !== "idle"}
            className="h-auto min-h-12 py-2 text-xs"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void scanImage(file);
            }}
          />
        </div>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          ภาพใช้ถอดรหัสบนอุปกรณ์ ไม่มีการอัปโหลดภาพไปบริการภายนอก
          ปิดหน้าต่างเพื่อกลับไปพิมพ์รหัสเองได้
        </p>
      </DialogContent>
    </Dialog>
  );
}
