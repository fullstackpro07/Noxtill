"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DigitizerScannerType } from "@/lib/digitizer-api";
import { DigitizerIcon } from "../digitizer-icon";
import { useDigitizerStore } from "../digitizer-store";
import { useDigitizerData } from "../digitizer-data";
import { Btn, Card, Chip, Empty, fileSize, plural } from "../digitizer-ui";
import { ACCEPTED_TYPES, analyzeImageFile, analyzeVideoFrame, fileProblem, rotateImageFile, type CheckState, type ImageAnalysis } from "../image-quality";
import type { Tone } from "../digitizer-types";

interface Pending {
  id: string;
  file: File;
  previewUrl: string | null;
  analysis: ImageAnalysis | null;
  analyzing: boolean;
}

const TYPE_OPTIONS: { label: string; icon: string; scanner: DigitizerScannerType; hint: string }[] = [
  { label: "Auto-detect", icon: "sparkles", scanner: "general", hint: "The reader names the type after reading; you can re-run it as another type" },
  { label: "Customer list", icon: "users-round", scanner: "customer_list", hint: "Names, phones, emails, opening balances" },
  { label: "Purchase invoice", icon: "file-spreadsheet", scanner: "invoice", hint: "One expense for the printed total, line items checked against it" },
  { label: "Sales receipt", icon: "receipt", scanner: "receipt", hint: "One expense for the printed total" },
  { label: "Inventory sheet", icon: "boxes", scanner: "inventory_sheet", hint: "Updates the stock of products you already have" },
  { label: "Credit ledger", icon: "credit-card", scanner: "credit_ledger", hint: "Opening balances per customer, reconciled against the written closing balance" },
  { label: "Product list", icon: "package", scanner: "product", hint: "New products with prices, SKUs and stock" },
  { label: "Business card", icon: "file-text", scanner: "business_card", hint: "A supplier contact" },
];
const UNSUPPORTED = ["Booking register", "Staff register"];

const chipTone = (s: CheckState): Tone => (s === "passed" ? "green" : s === "warning" ? "amber" : s === "failed" ? "red" : "neutral");
const stateLabel = (s: CheckState) => (s === "passed" ? "Passed" : s === "warning" ? "Warning" : s === "failed" ? "Failed" : "After upload");
const stateIcon = (s: CheckState) => (s === "passed" ? "circle-check" : s === "later" ? "info" : "triangle-alert");

export function CaptureScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { notify, notifyError } = useDigitizerStore();
  const { upload, uploading } = useDigitizerData();

  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [items, setItems] = useState<Pending[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [scanner, setScanner] = useState<DigitizerScannerType>("general");
  const [dragging, setDragging] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [live, setLive] = useState<ImageAnalysis | null>(null);

  // Only known in the browser — checked after mount so the server-rendered page and the first client render agree.
  const [cameraSupported, setCameraSupported] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCameraSupported(!!navigator.mediaDevices?.getUserMedia), 0);
    return () => clearTimeout(t);
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted: Pending[] = [];
      for (const file of files) {
        const problem = fileProblem(file);
        if (problem) {
          notifyError("File not added", problem);
          continue;
        }
        accepted.push({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, analysis: null, analyzing: file.type.startsWith("image/") });
      }
      if (!accepted.length) return;
      setItems((prev) => [...prev, ...accepted]);
      setFocusId(accepted[accepted.length - 1].id);
      for (const item of accepted) {
        if (!item.analyzing) continue;
        const analysis = await analyzeImageFile(item.file);
        setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, analysis, analyzing: false } : p)));
      }
    },
    [notifyError],
  );

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
    setLive(null);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      stream.current = s;
      setCameraError(null);
      setCameraOn(true);
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setCameraError(denied ? "Camera access was blocked. Allow it in your browser’s site settings, or upload a photo instead." : "No camera could be started on this device. Upload a photo instead.");
    }
  }, []);

  // Attach the stream once the <video> exists, and measure a frame every ~0.8s while it is live.
  useEffect(() => {
    if (!cameraOn || !video.current || !stream.current) return;
    const el = video.current;
    el.srcObject = stream.current;
    void el.play().catch(() => undefined);
    const timer = setInterval(() => setLive(analyzeVideoFrame(el)), 800);
    return () => clearInterval(timer);
  }, [cameraOn]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  // "Take photo" in the header opens this page with the camera already on.
  useEffect(() => {
    if (params.get("camera") !== "1" || !cameraSupported) return;
    const t = setTimeout(() => void startCamera(), 0);
    return () => clearTimeout(t);
  }, [params, cameraSupported, startCamera]);
  useEffect(() => {
    const urls = items.map((i) => i.previewUrl).filter(Boolean) as string[];
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
    // Previews are only released when the screen unmounts; removing a page revokes its own url below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = async () => {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) return notifyError("Could not capture", "Try again.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await addFiles([new File([blob], `capture-${stamp}.jpg`, { type: "image/jpeg" })]);
    notify("Page captured", "Add another page, or process what you have.");
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const rotate = async (id: string) => {
    const target = items.find((p) => p.id === id);
    if (!target) return;
    try {
      const rotated = await rotateImageFile(target.file);
      if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const analysis = await analyzeImageFile(rotated);
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, file: rotated, previewUrl: URL.createObjectURL(rotated), analysis } : p)));
    } catch (e) {
      notifyError("Could not rotate", e instanceof Error ? e.message : "Try again.");
    }
  };

  const process = async () => {
    if (!items.length) return;
    const out = await upload({ files: items.map((i) => i.file), scannerType: scanner });
    if (!out.documents.length) return;
    stopCamera();
    setItems([]);
    router.push(out.documents.length === 1 ? `/digitizer/review?batch=${out.documents[0].id}` : "/digitizer/queue");
  };

  const focused = items.find((i) => i.id === focusId) ?? items[items.length - 1] ?? null;
  const liveChips = live ? live.checks.filter((c) => c.state !== "later" && c.key !== "resolution") : [];
  const typeHint = TYPE_OPTIONS.find((t) => t.scanner === scanner)?.hint;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "18px", alignItems: "start" }}>
        {/* Camera */}
        <div style={{ minWidth: 0, background: "#0C1727", borderRadius: "14px", overflow: "hidden" }}>
          <div style={{ position: "relative", height: "320px", background: "repeating-linear-gradient(135deg, #16243A 0 12px, #1A2C44 12px 24px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {cameraOn ? (
              <>
                <video ref={video} muted playsInline autoPlay style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: "28px", border: "2px solid rgba(34,197,94,.7)", borderRadius: "10px", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "14px", left: "14px", right: "14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ height: "22px", display: "inline-flex", alignItems: "center", gap: "5px", padding: "0 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 700, background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)", color: "#6EE7A0" }}>
                    <DigitizerIcon name="scan-line" size={12} />
                    <span>Live camera{live ? ` · ${live.width} × ${live.height}` : ""}</span>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {liveChips.map((c) => (
                      <div key={c.key} title={c.detail} style={{ height: "20px", display: "inline-flex", alignItems: "center", padding: "0 7px", borderRadius: "999px", fontSize: "9.5px", fontWeight: 700, whiteSpace: "nowrap", background: c.state === "passed" ? "rgba(34,197,94,.15)" : "rgba(245,158,11,.18)", border: `1px solid ${c.state === "passed" ? "rgba(34,197,94,.4)" : "rgba(245,158,11,.4)"}`, color: c.state === "passed" ? "#6EE7A0" : "#FCD34D" }}>
                        {c.label}: {c.state === "passed" ? "ok" : c.state === "warning" ? "check" : "poor"}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", color: "#A4B1C4", padding: "0 24px", maxWidth: "340px" }}>
                <DigitizerIcon name="camera" size={26} style={{ margin: "0 auto", color: "#6EE7A0" }} />
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#fff", marginTop: "12px" }}>{cameraSupported ? "The camera is off" : "No camera available here"}</div>
                <div style={{ fontSize: "11.5px", lineHeight: 1.55, marginTop: "6px" }}>
                  {cameraError ?? (cameraSupported ? "Turn it on to photograph a page. Blur, glare and lighting are measured live so you can retake before uploading." : "Camera capture needs a secure (https) connection and a device with a camera. You can still upload photos or PDFs.")}
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {cameraOn ? (
              <>
                <div onClick={capture} style={{ height: "38px", display: "flex", alignItems: "center", gap: "7px", padding: "0 14px", borderRadius: "10px", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: "#16A34A", border: "1px solid #16A34A", color: "#fff" }}>
                  <DigitizerIcon name="camera" size={15} />
                  <span>Capture page {items.length + 1}</span>
                </div>
                <div onClick={stopCamera} style={{ height: "38px", display: "flex", alignItems: "center", gap: "7px", padding: "0 14px", borderRadius: "10px", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", color: "#fff" }}>
                  <span>Turn camera off</span>
                </div>
              </>
            ) : (
              cameraSupported && (
                <div onClick={() => void startCamera()} style={{ height: "38px", display: "flex", alignItems: "center", gap: "7px", padding: "0 14px", borderRadius: "10px", cursor: "pointer", fontSize: "12.5px", fontWeight: 700, background: "#16A34A", border: "1px solid #16A34A", color: "#fff" }}>
                  <DigitizerIcon name="camera" size={15} />
                  <span>Start camera</span>
                </div>
              )
            )}
            <div style={{ marginLeft: "auto", fontSize: "10.5px", color: "#7F8DA3", lineHeight: 1.4, maxWidth: "220px" }}>Each captured page becomes its own document; pages taken together are grouped as one batch.</div>
          </div>
        </div>

        {/* Upload + checks */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
            style={{ border: `1px dashed ${dragging ? "#16A34A" : "#C3CAD4"}`, borderRadius: "13px", padding: "24px", textAlign: "center", cursor: "pointer", background: dragging ? "#F6FEF9" : "#fff" }}
          >
            <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "#ECFDF3", color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <DigitizerIcon name="upload" size={20} />
            </div>
            <div style={{ fontSize: "13.5px", fontWeight: 800, marginTop: "11px" }}>Drop files, or click to choose</div>
            <div style={{ fontSize: "11.5px", color: "#7A8798", marginTop: "5px", lineHeight: 1.5 }}>
              JPG · PNG · WEBP · PDF · up to 10 MB per image, 20 MB and 40 pages per PDF. HEIC and Office files are not supported.
            </div>
          </div>

          <Card padding="16px 17px">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "13.5px", fontWeight: 800 }}>Before processing</div>
              {focused && <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94A3B8", maxWidth: "50%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{focused.file.name}</span>}
            </div>
            {!focused ? (
              <Empty title="Nothing chosen yet" icon="scan-line">Choose or capture a page and its quality is measured here before anything is uploaded.</Empty>
            ) : focused.analyzing ? (
              <div style={{ padding: "22px", textAlign: "center", fontSize: "12px", color: "#7A8798" }}>Measuring the photo…</div>
            ) : focused.analysis ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "12px" }}>
                {focused.analysis.checks.map((c) => (
                  <div key={c.key} onClick={() => notify(`${c.label} · ${stateLabel(c.state)}`, c.detail)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", borderRadius: "10px", cursor: "pointer" }}>
                    <DigitizerIcon name={stateIcon(c.state)} size={15} style={{ color: c.state === "passed" ? "#15803D" : c.state === "later" ? "#94A3B8" : c.state === "failed" ? "#B42318" : "#B45309" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 700 }}>{c.label}</div>
                      <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "2px", lineHeight: 1.4 }}>{c.detail}</div>
                    </div>
                    <Chip tone={chipTone(c.state)} style={{ height: "21px", fontSize: "10px" }}>{stateLabel(c.state)}</Chip>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: "16px 4px 4px", fontSize: "12px", color: "#5B6675", lineHeight: 1.55 }}>
                {focused.file.type === "application/pdf" ? "A PDF cannot be measured in the browser — its pages are checked by the reader after upload." : "This image could not be measured in the browser; it will still be read."}
              </div>
            )}
            <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "13px", paddingTop: "12px", borderTop: "1px solid #EEF0F3", lineHeight: 1.5 }}>
              These are measurements of the actual pixels, not estimates. No enhancement is applied — the file you choose is exactly what is stored and read.
            </div>
          </Card>
        </div>
      </div>

      {/* Pages ready */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Ready to process</div>
          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#94A3B8" }}>{items.length ? `${plural(items.length, "file")} · ${fileSize(items.reduce((n, i) => n + i.file.size, 0))}` : "Nothing added yet"}</div>
        </div>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
            {items.map((it) => (
              <div key={it.id} onClick={() => setFocusId(it.id)} style={{ width: "132px", border: `1px solid ${it.id === focused?.id ? "#16A34A" : "#E6E8EC"}`, borderRadius: "11px", overflow: "hidden", cursor: "pointer", background: "#fff" }}>
                <div style={{ height: "92px", background: "#F5F6F8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {it.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.previewUrl} alt={it.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <DigitizerIcon name="file-text" size={26} style={{ color: "#94A3B8" }} />
                  )}
                </div>
                <div style={{ padding: "7px 8px" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.file.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                    <span style={{ fontSize: "10px", color: "#94A3B8" }}>{fileSize(it.file.size)}</span>
                    <span style={{ marginLeft: "auto", display: "flex", gap: "8px", color: "#7A8798" }}>
                      {it.previewUrl && (
                        <span
                          title="Rotate a quarter turn"
                          onClick={(e) => {
                            e.stopPropagation();
                            void rotate(it.id);
                          }}
                        >
                          <DigitizerIcon name="rotate-cw" size={13} />
                        </span>
                      )}
                      <span
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(it.id);
                        }}
                      >
                        <DigitizerIcon name="x" size={13} />
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Type + go */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "14px", fontWeight: 800 }}>Document type</div>
          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#94A3B8" }}>Leave it on Auto-detect and the reader names the type; you can re-run it as another type later</div>
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
          {TYPE_OPTIONS.map((t) => {
            const on = scanner === t.scanner;
            return (
              <div key={t.label} onClick={() => setScanner(t.scanner)} title={t.hint} style={{ height: "34px", display: "flex", alignItems: "center", gap: "7px", padding: "0 12px", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? "#16A34A" : "#D5DAE2"}`, background: on ? "#ECFDF3" : "#fff", color: on ? "#15803D" : "#45505F" }}>
                <DigitizerIcon name={t.icon} size={14} />
                <span>{t.label}</span>
              </div>
            );
          })}
          {UNSUPPORTED.map((label) => (
            <div key={label} title="There is no importer for this document type yet" style={{ height: "34px", display: "flex", alignItems: "center", gap: "7px", padding: "0 12px", borderRadius: "10px", fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, border: "1px dashed #D5DAE2", color: "#94A3B8" }}>
              {label} · not supported yet
            </div>
          ))}
        </div>
        {typeHint && <div style={{ fontSize: "11.5px", color: "#7A8798", marginTop: "11px" }}>{typeHint}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <Btn primary icon={uploading ? "loader" : "scan-text"} disabled={!items.length || uploading} onClick={() => void process()} style={{ height: "36px", fontSize: "13px" }}>
            {uploading ? "Uploading…" : items.length ? `Read ${plural(items.length, "document")}` : "Read documents"}
          </Btn>
          <span style={{ fontSize: "11.5px", color: "#94A3B8" }}>Reading happens on the server after upload — you can leave this page. Nothing is written to any module.</span>
        </div>
      </Card>
    </div>
  );
}
