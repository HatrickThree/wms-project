import assert from "node:assert/strict";
import { Html5Qrcode } from "html5-qrcode";
import { preferredCamera, cameraMessage } from "../src/lib/camera.ts";

// Verify against the installed decoder, not a mock of its input validation.
const videoConstraints = Html5Qrcode.prototype.createVideoConstraints;
assert.equal(typeof videoConstraints, "function");
assert.throws(() =>
  videoConstraints.call({}, { facingMode: { ideal: "environment" } }),
);
assert.deepEqual(videoConstraints.call({}, preferredCamera), {
  facingMode: "environment",
});
assert.ok(
  !JSON.stringify(preferredCamera).includes("exact"),
  "Rear camera must remain a preference for desktop webcams",
);
assert.match(
  cameraMessage(new DOMException("blocked", "NotAllowedError")),
  /สิทธิ์กล้อง/,
);
assert.match(
  cameraMessage({ name: "NotFoundError", message: "No video device" }),
  /ไม่พบกล้อง/,
);
assert.match(
  cameraMessage("NotReadableError: Could not start video source"),
  /ถูกใช้งาน/,
);
assert.match(cameraMessage({ name: "OverconstrainedError" }), /ไม่รองรับ/);
assert.match(cameraMessage(new Error("Loading chunk 123 failed")), /รีโหลด/);
assert.match(cameraMessage(null), /เปิดกล้องไม่สำเร็จ/);
console.log(
  "PASS: reproduced legacy facingMode rejection; shared camera settings accepted by installed decoder; camera errors remain actionable",
);
