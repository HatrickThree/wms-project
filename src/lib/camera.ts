// html5-qrcode 2.3.8 accepts a facingMode string or { exact: ... },
// but rejects { ideal: ... } before it calls getUserMedia. A plain string is
// a preference, so a desktop webcam can still be used without a rear camera.
export const preferredCamera: MediaTrackConstraints = {
  facingMode: "environment",
};

export function cameraMessage(error: unknown) {
  const details =
    typeof error === "object" && error !== null
      ? (error as { name?: unknown; message?: unknown })
      : null;
  const text = details
    ? [details.name, details.message]
        .filter((value) => typeof value === "string")
        .join(" ")
    : String(error);
  if (/NotAllowed|Permission|denied|SecurityError/i.test(text))
    return "ยังไม่ได้รับอนุญาตให้ใช้กล้อง เปิดสิทธิ์กล้องของเว็บไซต์ในเบราว์เซอร์ แล้วลองใหม่ หรือเลือกอ่านจากภาพแทน";
  if (/NotFound|DevicesNotFound/i.test(text))
    return "ไม่พบกล้องบนอุปกรณ์นี้ เชื่อมต่อกล้องแล้วลองใหม่ หรือเลือกอ่านจากภาพแทน";
  if (/NotReadable|TrackStart|Could not start|AbortError/i.test(text))
    return "เปิดกล้องไม่ได้ กล้องอาจถูกใช้งานอยู่ ลองปิดแอปหรือแท็บที่ใช้กล้องแล้วเปิดใหม่";
  if (/Overconstrained|ConstraintNotSatisfied/i.test(text))
    return "กล้องบนอุปกรณ์นี้ไม่รองรับการตั้งค่าที่ร้องขอ ลองเปิดด้วยเบราว์เซอร์อื่น หรือเลือกอ่านจากภาพแทน";
  if (
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
      text,
    )
  )
    return "โหลดตัวอ่านรหัสไม่สำเร็จ กรุณารีโหลดหน้าเว็บแล้วเปิดกล้องอีกครั้ง";
  return "เปิดกล้องไม่สำเร็จ ลองปิดแล้วเปิดหน้าสแกนใหม่ หรือเลือกอ่านรหัสจากภาพแทน";
}
