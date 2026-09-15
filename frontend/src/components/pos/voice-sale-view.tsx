"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Mic, Square, Trash2 } from "lucide-react";
import { fetchProducts } from "@/lib/products-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { parseVoiceSale, confirmVoiceSale, type ParsedVoiceSale } from "@/lib/voice-sale-api";

type PaymentMethod = "cash" | "card" | "online" | "credit";
type VoState = "idle" | "recording" | "processing" | "ready" | "error";

interface DraftLine {
  key: string;
  productId: string | null;
  label: string;
  qty: number;
}

const CANDIDATE_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];
const STATUS_LABEL: Record<VoState, string> = { idle: "Microphone idle", recording: "Listening…", processing: "Processing speech", ready: "Ready to confirm", error: "Could not hear that clearly" };
const STATUS_COLOR: Record<VoState, string> = {
  idle: "var(--app-text-disabled)",
  recording: "var(--app-warning-text)",
  processing: "var(--app-text-disabled)",
  ready: "var(--app-primary)",
  error: "var(--app-danger-strong)",
};

/** Fast Sale — Voice Sale screen, restructured from the old small-dialog trigger into the design's
 * full-screen layout. Reuses the exact same real recording/transcription/confirm pipeline
 * (`parseVoiceSale`/`confirmVoiceSale`) — no new backend behavior, just the pixel-matched shell.
 * There's no real "confidence score" or streaming partial-transcript from the backend, so — per
 * this session's standing rule — those parts of the design are left out rather than faked. */
export function VoiceSaleView({ currency }: { currency: string }) {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [voState, setVoState] = useState<VoState>("idle");
  const [draft, setDraft] = useState<ParsedVoiceSale | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  const parseMutation = useMutation({
    mutationFn: (audio: Blob) => parseVoiceSale(audio, `voice-sale-${Date.now()}.webm`),
    onSuccess: (parsed) => {
      if (parsed.items.length === 0) {
        setVoState("error");
        return;
      }
      setDraft(parsed);
      setLines(parsed.items.map((item, i) => ({ key: `${i}-${item.productId ?? item.name}`, productId: item.productId, label: item.name, qty: item.qty })));
      setCustomerName(parsed.customerName ?? "");
      if (parsed.paymentMethodGuess) setPaymentMethod(parsed.paymentMethodGuess);
      setVoState("ready");
    },
    onError: (err) => {
      setVoState("error");
      toast.error(err instanceof ApiError ? err.message : "Couldn't transcribe that recording — please try again.");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("no draft");
      return confirmVoiceSale(draft.id, {
        items: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId as string, qty: l.qty })),
        payment: { method: paymentMethod },
        ...(session.user.businessUserId ? { staffUserId: session.user.businessUserId } : {}),
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      });
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products", "active"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(order.total, currency)} via ${paymentMethod}.`);
      reset();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't complete this sale — please try again."),
  });

  function reset() {
    setDraft(null);
    setLines([]);
    setCustomerName("");
    setPaymentMethod("cash");
    setVoState("idle");
  }

  function priceOf(productId: string | null): number {
    return products.find((p) => p.id === productId)?.price ?? 0;
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = CANDIDATE_MIME_TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          setVoState("processing");
          parseMutation.mutate(blob);
        } else {
          setVoState("idle");
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setVoState("recording");
    } catch {
      toast.error("Couldn't access your microphone — check your browser's permission for this site.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeLine(key: string) {
    setLines((rows) => rows.filter((r) => r.key !== key));
  }

  const total = useMemo(() => {
    const priceById = new Map(products.map((p) => [p.id, p.price]));
    return lines.reduce((sum, l) => sum + (priceById.get(l.productId ?? "") ?? 0) * l.qty, 0);
  }, [lines, products]);
  const allResolved = lines.length > 0 && lines.every((l) => l.productId);

  const inputStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 11, padding: 11, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 46 };
  const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 12, padding: "14px 18px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 50 };

  return (
    <main className="grid items-start gap-4 px-[22px] pb-[26px] pt-4" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
      <section className="flex min-w-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="m-0 text-[20px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>Voice Sale</h2>
            <p className="mt-[3px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Add products by speaking</p>
          </div>
          <div className="ms-auto flex items-center gap-2 rounded-[22px] p-[8px_14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[voState] }} />
            <span className="text-[12px] font-bold" style={{ color: STATUS_COLOR[voState] }}>{STATUS_LABEL[voState]}</span>
          </div>
        </div>

        {voState === "idle" && !draft && (
          <div className="rounded-[16px] p-[34px_24px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="mx-auto flex h-[58px] w-[58px] items-center justify-center rounded-full" style={{ background: "var(--app-success-bg)" }}>
              <Mic className="h-7 w-7" style={{ color: "var(--app-primary)" }} aria-hidden />
            </div>
            <h3 className="mt-3.5 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>Voice Sales tutorial</h3>
            <p className="mx-auto mt-[7px] max-w-[44ch] text-[13px] leading-[1.6]" style={{ color: "var(--app-text-faint)" }}>
              Hold the button and say the sale out loud. Noxtill matches your words to real products in your catalog.
            </p>
            <div className="mx-auto mt-4 max-w-[400px] rounded-[12px] p-[13px] text-[13.5px] font-bold" style={{ background: "var(--app-page-bg, #FAFBFC)", border: "1px solid var(--app-surface-2)", color: "var(--app-text-muted)" }}>
              &ldquo;Add 2 hair serums and one beard trim.&rdquo;
            </div>
          </div>
        )}

        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-[11px] flex items-center gap-2">
            <Mic className="h-[17px] w-[17px]" style={{ color: "var(--app-primary)" }} aria-hidden />
            <h3 className="m-0 flex-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>What I Heard</h3>
          </div>
          <div className="rounded-[12px] p-4 text-[14px] leading-[1.6]" style={{ background: "var(--app-page-bg, #FAFBFC)", border: "1px dashed var(--app-border-strong)", color: "var(--app-text-muted)", minHeight: 74 }}>
            {draft ? draft.transcript : <span style={{ color: "var(--app-text-disabled)" }}>Your words appear here as you speak.</span>}
          </div>
          <div className="mt-[13px] flex flex-wrap gap-2.5">
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={() => voState === "recording" && stopRecording()}
              onTouchStart={(e) => {
                e.preventDefault();
                startRecording();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopRecording();
              }}
              disabled={parseMutation.isPending}
              className="flex min-h-[50px] min-w-[150px] flex-1 items-center justify-center gap-2 rounded-[12px] p-3.5 text-[13.5px] font-extrabold text-white"
              style={{ background: voState === "recording" ? "var(--app-danger-strong)" : "var(--app-sidebar-bg)" }}
            >
              {voState === "recording" ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-[17px] w-[17px]" aria-hidden />}
              {voState === "recording" ? "Release to Stop" : "Hold to Speak"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="flex flex-wrap items-center gap-2.5 p-[15px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Parsed line items</h3>
            <span className="ms-auto text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Speech matching is a best guess — always check the list</span>
          </div>
          {lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 520 }}>
                <thead>
                  <tr style={{ background: "var(--app-page-bg, #FAFBFC)" }}>
                    <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Item</th>
                    <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Qty</th>
                    <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Price</th>
                    <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Subtotal</th>
                    <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                      <td className="p-[11px_17px] text-[12.5px] font-bold" style={{ color: l.productId ? "var(--app-text)" : "var(--app-danger-strong)" }}>
                        {l.productId ? l.label : `${l.label} — needs a product`}
                      </td>
                      <td className="p-[11px] text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <button onClick={() => updateLine(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="Decrease" className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[15px] font-extrabold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>−</button>
                          <span className="min-w-5 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{l.qty}</span>
                          <button onClick={() => updateLine(l.key, { qty: l.qty + 1 })} aria-label="Increase" className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[15px] font-extrabold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>+</button>
                        </span>
                      </td>
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{formatCurrency(priceOf(l.productId), currency)}</td>
                      <td className="p-[11px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(priceOf(l.productId) * l.qty, currency)}</td>
                      <td className="p-[11px_17px] text-end">
                        <select
                          value={l.productId ?? ""}
                          onChange={(e) => updateLine(l.key, { productId: e.target.value || null })}
                          aria-label={`Product for "${l.label}"`}
                          className="me-2 rounded-[8px] p-1.5 text-[11.5px]"
                          style={{ border: "1px solid var(--app-border)" }}
                        >
                          <option value="">Select…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button onClick={() => removeLine(l.key)} aria-label="Remove item" style={{ color: "var(--app-border-strong)" }}><Trash2 className="inline h-4 w-4" aria-hidden /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : voState === "error" ? (
            <div className="p-[28px_17px] text-center">
              <div className="text-[13.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Could not hear that clearly</div>
              <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing was saved. Try speaking again, a little slower.</div>
            </div>
          ) : (
            <div className="p-[28px_17px] text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing parsed yet.</div>
          )}
        </div>
      </section>

      <aside className="sticky top-[60px] flex flex-col gap-3.5 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Sale Detected</h3>
        {lines.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-2.5 border-b pb-2" style={{ borderColor: "var(--app-page-bg, #F6F8FA)" }}>
                <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{l.label}</span>
                <span className="text-[12px] font-bold" style={{ color: "var(--app-text-faint)" }}>× {l.qty}</span>
                <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(priceOf(l.productId) * l.qty, currency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] leading-[1.6]" style={{ color: "var(--app-text-disabled)" }}>Nothing detected yet — start speaking and the parsed sale appears here.</p>
        )}
        <label className="block">
          <span className="mb-[5px] block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>DETECTED PAYMENT METHOD</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} aria-label="Payment method" className="w-full" style={inputStyle}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="online">Online</option>
            <option value="credit">Credit</option>
          </select>
        </label>
        <div className="flex items-baseline justify-between border-t pt-3" style={{ borderColor: "var(--app-border-strong)", borderStyle: "dashed" }}>
          <span className="text-[13px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Total</span>
          <span className="text-[24px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.8px" }}>{formatCurrency(total, currency)}</span>
        </div>
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={!allResolved || confirmMutation.isPending}
          className="rounded-[13px] p-[15px] text-[14px] font-extrabold text-white disabled:opacity-60"
          style={{ background: "var(--app-primary)" }}
        >
          {confirmMutation.isPending ? "Saving…" : "Save It"}
        </button>
        <div className="flex gap-2.5">
          <button onClick={reset} style={outlineBtn} className="flex-1">That&apos;s Wrong</button>
          <button onClick={() => router.push("/sales")} style={outlineBtn} className="flex-1">Switch to Manual</button>
        </div>
      </aside>
    </main>
  );
}
