// Barcode scanner for packaged food. Uses the browser's BarcodeDetector (Chrome on Android)
// on the rear camera; typing the digits works everywhere as a fallback.

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

export function canScan() {
  return "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Builds the scan view. Calls onCode({code, grams}) once with the first barcode read or typed.
 * Returns {node, stop}; stop() must run when the view goes away so the camera turns off.
 */
export function scanView({ el, onCode }) {
  let stream = null;
  let stopped = false;
  let done = false;
  const video = el("video", { class: "scan-video", playsinline: true, muted: true, autoplay: true });
  const status = el("p", { class: "hint" }, canScan() ? "Point the camera at the barcode." : "Type the number under the barcode.");
  const grams = el("input", { class: "field", type: "number", inputmode: "decimal", min: "1", max: "5000", placeholder: "Grams eaten (optional, default: one serving)" });

  function finish(code) {
    if (done) return;
    done = true;
    stop();
    onCode({ code, grams: grams.value ? Number(grams.value) : undefined });
  }

  const typed = el("input", { class: "field", name: "code", inputmode: "numeric", pattern: "[0-9]{8,14}", placeholder: "Barcode digits", required: true });
  const form = el("form", { class: "stack", onsubmit: (e) => { e.preventDefault(); if (typed.checkValidity()) finish(typed.value.trim()); } },
    typed,
    el("button", { class: "btn block", type: "submit" }, "Look it up"));

  function stop() {
    stopped = true;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function start() {
    if (!canScan()) { video.hidden = true; return; }
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats?.().catch(() => FORMATS) ?? FORMATS;
      const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (stopped) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const tick = async () => {
        if (stopped || done) return;
        try {
          const found = await detector.detect(video);
          const hit = found.find((b) => /^\d{8,14}$/.test(b.rawValue));
          if (hit) { navigator.vibrate?.(40); finish(hit.rawValue); return; }
        } catch { /* frame not ready yet */ }
        setTimeout(tick, 250);
      };
      tick();
    } catch {
      video.hidden = true;
      status.textContent = "Camera isn't available. Type the number under the barcode.";
    }
  }

  start();
  return { node: el("div", { class: "stack scan" }, video, status, grams, form), stop };
}
