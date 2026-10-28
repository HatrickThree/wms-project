"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Volume2, VolumeX, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SpeechContextValue {
  supported: boolean;
  enabled: boolean;
  speaking: boolean;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  rate: number;
  error: string;
  setEnabled: (value: boolean) => void;
  setVoiceURI: (value: string) => void;
  setRate: (value: number) => void;
  reload: () => void;
  stop: () => void;
  speak: (text: string, automatic?: boolean) => void;
}
const SpeechContext = createContext<SpeechContextValue>({
  supported: false,
  enabled: false,
  speaking: false,
  voices: [],
  voiceURI: "",
  rate: 1,
  error: "",
  setEnabled: () => {},
  setVoiceURI: () => {},
  setRate: () => {},
  reload: () => {},
  stop: () => {},
  speak: () => {},
});
export function SpeechProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const lastAutomatic = useRef({ text: "", at: 0 });
  const stop = useCallback(() => {
    generation.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);
  const reload = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const available = window.speechSynthesis
      .getVoices()
      .filter((v) => v.localService && v.lang.toLowerCase().startsWith("th"));
    setVoices(available);
    setVoiceURI((old) =>
      available.some((v) => v.voiceURI === old)
        ? old
        : available[0]?.voiceURI || "",
    );
  }, []);
  useEffect(() => {
    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    )
      return;
    setSupported(true);
    reload();
    window.speechSynthesis.addEventListener("voiceschanged", reload);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", reload);
      generation.current += 1;
      window.speechSynthesis.cancel();
    };
  }, [reload]);
  useEffect(() => {
    stop();
  }, [pathname, stop]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [stop]);
  const speak = useCallback(
    (text: string, automatic = false) => {
      if (!enabled || !supported || !text.trim() || document.hidden) return;
      const voice = voices.find(
        (v) =>
          v.voiceURI === voiceURI &&
          v.localService &&
          v.lang.toLowerCase().startsWith("th"),
      );
      if (!voice) {
        setError("ยังไม่พบเสียงภาษาไทยบนอุปกรณ์ กรุณาโหลดรายชื่อเสียงใหม่");
        return;
      }
      const now = Date.now();
      if (
        automatic &&
        lastAutomatic.current.text === text &&
        now - lastAutomatic.current.at < 250
      )
        return;
      if (automatic) lastAutomatic.current = { text, at: now };
      const token = ++generation.current;
      window.speechSynthesis.cancel();
      setError("");
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 5000));
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = rate;
      utterance.onstart = () => {
        if (token === generation.current) setSpeaking(true);
      };
      utterance.onend = () => {
        if (token === generation.current) setSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (token !== generation.current) return;
        setSpeaking(false);
        if (!["canceled", "interrupted"].includes(event.error))
          setError(
            "อ่านเสียงไม่ได้ กรุณาตรวจเสียงระบบ หรือหยุดแล้วลองอ่านใหม่",
          );
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setSpeaking(false);
        setError("อ่านเสียงไม่ได้ กรุณาตรวจเสียงระบบแล้วลองใหม่");
      }
    },
    [enabled, supported, voices, voiceURI, rate],
  );
  const setEnabled = (value: boolean) => {
    setEnabledState(value && supported && voices.length > 0);
    if (!value) stop();
    setError("");
  };
  return (
    <SpeechContext.Provider
      value={{
        supported,
        enabled,
        speaking,
        voices,
        voiceURI,
        rate,
        error,
        setEnabled,
        setVoiceURI,
        setRate,
        reload,
        stop,
        speak,
      }}
    >
      {children}
    </SpeechContext.Provider>
  );
}

const instructions: Record<string, string> = {
  "/inbound":
    "ระบุเลขที่ใบรับ สแกนชั้นวาง ตรวจสินค้า เลือกจำนวนและหน่วย ระบุล็อตและวันหมดอายุตามสินค้า สินค้าที่ควบคุมซีเรียลให้สแกนครบตามจำนวนหน่วยหลัก ทบทวนข้อมูล แล้วกดบันทึกรับเข้า",
  "/outbound":
    "สร้างคำสั่งซื้อและรายการสินค้า จองตามลำดับรับเข้าหรือวันหมดอายุ ตรวจตำแหน่ง ซีเรียล และจำนวนในใบหยิบ เมื่อหยิบครบให้ทบทวนและยืนยันจ่าย ยอดถือครองจะลดเมื่อยืนยันจ่ายแล้ว",
  "/transfers":
    "เลือกรอบรับเข้าต้นทาง สแกนตำแหน่งต้นทางและปลายทาง ระบุจำนวนและหน่วย สแกนซีเรียลถ้ามี ตรวจว่าจำนวนไม่เกินยอดที่ไม่จอง แล้วบันทึกย้าย วันรับเข้าและล็อตเดิมยังคงอยู่",
  "/counts":
    "เลือกสินค้าและวิธีทำงานระหว่างนับ เริ่มแผนตรวจนับ บันทึกจำนวนหรือซีเรียลให้ครบทุกตำแหน่ง โดยไม่ดูยอดอ้างอิง หากไม่พบสินค้าให้บันทึกศูนย์ ส่งผลนับ แล้วรอผู้มีสิทธิ์ตรวจหลักฐานและอนุมัติ",
  "/abc":
    "ยืนยันการตั้งค่า เลือกช่วงเอกสารจ่าย แล้ววิเคราะห์เป็นข้อเสนอ ทบทวนความถี่และกลุ่มที่แนะนำ เลือกสินค้าที่ต้องการยืนยัน กำหนดรอบวันตรวจนับแยกแต่ละกลุ่ม การวิเคราะห์อย่างเดียวยังไม่เปลี่ยนกลุ่มจริง",
};
export function SpeechSettingsControl({
  fullWidth = false,
}: {
  fullWidth?: boolean;
}) {
  const speech = useContext(SpeechContext);
  const path = usePathname();
  const prefix = useId();
  const guide =
    instructions[path] ||
    "เลือกงานจากเมนู ตรวจพื้นที่ธุรกิจหรือพื้นที่ฝึกให้ถูกต้องก่อนทำรายการ ข้อความผลตรวจยังอ่านบนหน้าจอได้เสมอ";
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={fullWidth ? "outline" : "ghost"}
          size={fullWidth ? "default" : "icon"}
          className={
            fullWidth
              ? "w-full justify-start border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
              : undefined
          }
          aria-label="ตั้งค่าเสียงอ่าน"
          title={
            speech.enabled ? "เสียงอ่านเปิดอยู่" : "เปิดการตั้งค่าเสียงอ่าน"
          }
        >
          {speech.enabled ? <Volume2 /> : <VolumeX />}
          {fullWidth && <span>เสียงอ่านขั้นตอนและผลตรวจ</span>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>เสียงอ่านขั้นตอนและผลตรวจ</DialogTitle>
        <DialogDescription>
          เริ่มปิดเมื่อเข้าสู่ระบบหรือเปลี่ยนพื้นที่ เปิดเองเพื่อฟังผลตรวจใหม่
          และกดอ่านขั้นตอนเมื่อต้องการ ไม่มีคำสั่งเสียงเปลี่ยนสต็อก
        </DialogDescription>
        {!speech.supported ? (
          <p className="text-sm text-muted-foreground">
            เบราว์เซอร์นี้ยังไม่รองรับเสียงอ่าน ข้อความบนหน้าจอใช้งานได้ตามปกติ
          </p>
        ) : !speech.voices.length ? (
          <p className="text-sm text-muted-foreground">
            ยังไม่พบเสียงภาษาไทยบนอุปกรณ์นี้ ระยะแรกใช้เสียงบนอุปกรณ์เท่านั้น
            ไม่เลือกบริการเสียงภายนอกให้อัตโนมัติ
          </p>
        ) : (
          <>
            <div className="field-group">
              <Label htmlFor={`${prefix}-voice`}>เสียงภาษาไทยบนอุปกรณ์</Label>
              <select
                id={`${prefix}-voice`}
                className="h-12 rounded-lg border bg-background px-3 text-sm"
                value={speech.voiceURI}
                onChange={(e) => speech.setVoiceURI(e.target.value)}
              >
                {speech.voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} · {v.lang}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <Label htmlFor={`${prefix}-rate`}>
                ความเร็วเสียง · {speech.rate.toFixed(1)} เท่า
              </Label>
              <input
                id={`${prefix}-rate`}
                className="min-h-11 w-full"
                type="range"
                min="0.7"
                max="1.3"
                step="0.1"
                value={speech.rate}
                onChange={(e) => speech.setRate(Number(e.target.value))}
              />
            </div>
          </>
        )}
        {speech.error && (
          <p className="text-sm text-destructive" role="status">
            {speech.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!speech.supported || !speech.voices.length}
            aria-pressed={speech.enabled}
            onClick={() => speech.setEnabled(!speech.enabled)}
          >
            {speech.enabled ? "ปิดเสียงอ่าน" : "เปิดเสียงอ่าน"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={speech.reload}
            disabled={!speech.supported}
          >
            โหลดรายชื่อเสียงใหม่
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!speech.enabled}
            onClick={() => speech.speak(guide)}
          >
            <Volume2 />
            อ่านขั้นตอนหน้านี้
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!speech.speaking}
            onClick={speech.stop}
          >
            <Square />
            หยุดเสียง
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ผลตรวจใหม่จะอ่านเมื่อเปิดเสียงไว้ หยุดอัตโนมัติเมื่อเปลี่ยนหน้า
          ซ่อนแท็บ หรือออกจากระบบ การอ่านข้อความไม่บันทึกรายการสินค้า
        </p>
      </DialogContent>
    </Dialog>
  );
}
export function SpeechAnnouncement({ text }: { text: string }) {
  const speech = useContext(SpeechContext);
  const previous = useRef("");
  useEffect(() => {
    if (previous.current === text) return;
    previous.current = text;
    if (speech.enabled) speech.speak(text, true);
  }, [text, speech.enabled, speech.speak]);
  return null;
}
