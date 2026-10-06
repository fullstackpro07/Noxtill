"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = (new (o?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };

const camErr = (e: unknown) => {
  const name = (e as DOMException)?.name ?? "";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow camera access for this site, or type the code below.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found on this device. Type or paste the code below.";
  return `Couldn’t open the camera${name ? ` (${name})` : ""}. Type or paste the code below.`;
};

/**
 * Live camera QR / barcode scanner. Reads frames from the camera and decodes them with the
 * browser's BarcodeDetector where it supports QR codes, or ZXing everywhere else (Safari,
 * Firefox, desktop Chrome on Windows). Calls onCode once with the first code read.
 */
export function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "error">("starting");
  const [msg, setMsg] = useState("Starting camera…");
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error");
        setMsg("This browser can’t open the camera. Type or paste the code below.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (e) {
        setState("error");
        setMsg(camErr(e));
        return;
      }
      const v = video.current;
      if (cancelled || !v) return;
      v.srcObject = stream;
      await v.play().catch(() => null);
      setState("scanning");
      setMsg("Point the camera at the asset’s QR code or barcode.");

      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const formats = Native?.getSupportedFormats ? await Native.getSupportedFormats().catch(() => [] as string[]) : [];
      let decode: (c: HTMLCanvasElement) => Promise<string | null>;
      if (Native && formats.includes("qr_code")) {
        const det = new Native({ formats });
        decode = async (c) => (await det.detect(c))[0]?.rawValue ?? null;
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        decode = (c) => {
          try {
            return Promise.resolve(reader.decodeFromCanvas(c).getText());
          } catch {
            return Promise.resolve(null); // no code in this frame
          }
        };
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const small = document.createElement("canvas");
      const tick = async () => {
        if (cancelled || done.current) return;
        if (ctx && v.videoWidth > 0 && v.videoHeight > 0) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          let code = await decode(canvas).catch(() => null);
          // Retry smaller copies: ZXing misses codes whose modules are very large (label held close).
          for (const f of [2, 4]) {
            if (code || !small || canvas.width / f < 160) break;
            small.width = Math.round(canvas.width / f);
            small.height = Math.round(canvas.height / f);
            small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
            code = await decode(small).catch(() => null);
          }
          if (code && !done.current) {
            done.current = true;
            onCode(code.trim());
            return;
          }
        }
        timer = setTimeout(() => void tick(), 200);
      };
      void tick();
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", background: "#0A1B2A", borderRadius: 12, overflow: "hidden", aspectRatio: "4 / 3", display: state === "error" ? "none" : "block" }}>
        <video ref={video} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div aria-hidden="true" style={{ position: "absolute", inset: "18%", border: "2px solid #39E28B", borderRadius: 12, boxShadow: "0 0 0 9999px rgba(10,27,42,.35)" }} />
      </div>
      <span role="status" style={{ fontSize: 11.5, color: state === "error" ? "#B42318" : "#667085", lineHeight: 1.45 }}>{msg}</span>
    </div>
  );
}
