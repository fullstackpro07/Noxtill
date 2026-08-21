"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchProducts } from "@/lib/products-api";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { parseVoiceSale, confirmVoiceSale, type ParsedVoiceSale } from "@/lib/voice-sale-api";

type PaymentMethod = "cash" | "card" | "wallet" | "credit";
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "wallet", label: "Wallet" },
  { key: "credit", label: "Credit" },
];

interface DraftLine {
  key: string;
  productId: string | null;
  label: string;
  qty: number;
}

const CANDIDATE_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

export function VoiceSaleRecorder({ currency }: { currency: string }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<ParsedVoiceSale | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data: products } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  const parseMutation = useMutation({
    mutationFn: (audio: Blob) => parseVoiceSale(audio, `voice-sale-${Date.now()}.webm`),
    onSuccess: (parsed) => {
      setDraft(parsed);
      setLines(
        parsed.items.map((item, i) => ({
          key: `${i}-${item.productId ?? item.name}`,
          productId: item.productId,
          label: item.name,
          qty: item.qty,
        })),
      );
      setCustomerName(parsed.customerName ?? "");
      if (parsed.paymentMethodGuess) setPaymentMethod(parsed.paymentMethodGuess === "online" ? "wallet" : parsed.paymentMethodGuess);
      if (parsed.items.length === 0) toast.error("Didn't catch any items in that — try again, naming each item clearly.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't transcribe that recording — please try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error("no draft");
      return confirmVoiceSale(draft.id, {
        items: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId as string, qty: l.qty })),
        payment: { method: paymentMethod === "wallet" ? "online" : paymentMethod },
        ...(session.user.businessUserId ? { staffUserId: session.user.businessUserId } : {}),
        ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
      });
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products", "active"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(order.total, currency)} via ${paymentMethod}.`);
      closeDialog();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't complete this sale — please try again."),
  });

  const allLinesResolved = lines.length > 0 && lines.every((l) => l.productId);

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
        if (blob.size > 0) parseMutation.mutate(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Couldn't access your microphone — check your browser's permission for this site.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  function closeDialog() {
    setDraft(null);
    setLines([]);
    setCustomerName("");
    setPaymentMethod("cash");
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeLine(key: string) {
    setLines((rows) => rows.filter((r) => r.key !== key));
  }

  const total = useMemo(() => {
    if (!products) return 0;
    return lines.reduce((sum, l) => {
      const product = products.find((p) => p.id === l.productId);
      return sum + (product?.price ?? 0) * l.qty;
    }, 0);
  }, [lines, products]);

  return (
    <>
      <button
        type="button"
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={() => recording && stopRecording()}
        onTouchStart={(e) => {
          e.preventDefault();
          startRecording();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          stopRecording();
        }}
        disabled={parseMutation.isPending}
        aria-label="Hold to speak a sale"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
          recording ? "animate-pulse border-destructive bg-destructive/10 text-destructive" : "border-border-strong text-fg-muted hover:bg-surface-2"
        }`}
      >
        {recording ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
      </button>

      <Dialog
        open={draft != null || parseMutation.isPending}
        onClose={closeDialog}
        title="Voice sale"
        description={parseMutation.isPending ? "Transcribing…" : draft ? `Heard: "${draft.transcript}"` : undefined}
        footer={
          draft && (
            <>
              <Button variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={() => confirmMutation.mutate()} disabled={!allLinesResolved || confirmMutation.isPending}>
                {confirmMutation.isPending ? "Confirming…" : "Confirm sale"}
              </Button>
            </>
          )
        }
      >
        {parseMutation.isPending && <SkeletonRow />}
        {draft && (
          <div className="flex flex-col gap-3.5">
            {lines.length === 0 ? (
              <p className="text-sm text-fg-muted">No items to confirm — cancel and try recording again.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {lines.map((line) => (
                  <div key={line.key} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        value={line.productId ?? ""}
                        onChange={(e) => updateLine(line.key, { productId: e.target.value || null })}
                        className={line.productId ? "w-full" : "w-full border-destructive"}
                        aria-label={`Product for "${line.label}"`}
                      >
                        <option value="" disabled>
                          {line.label} — select a product
                        </option>
                        {(products ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={(e) => updateLine(line.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-20"
                      aria-label="Quantity"
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeLine(line.key)} aria-label="Remove line">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name (optional)" />

            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPaymentMethod(m.key)}
                  className={`rounded-[var(--radius-sm)] border px-2 py-2 text-xs font-medium transition-colors ${
                    paymentMethod === m.key ? "border-primary bg-primary/8 text-primary" : "border-border text-fg-muted hover:bg-surface-2"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-medium text-fg-muted">Total</span>
              <span className="font-display text-lg font-bold text-fg">{formatCurrency(total, currency)}</span>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
