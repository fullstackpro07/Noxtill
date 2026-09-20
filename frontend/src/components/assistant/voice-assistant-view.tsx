"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Mic, Check, X, AlertTriangle } from "lucide-react";
import { proposeVoiceCommand, confirmVoiceCommand, cancelVoiceCommand, type ProposedVoiceCommand } from "@/lib/voice-command-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { AI } from "@/components/assistant/ai-assistant-ui";

const ACTION_LABELS: Record<ProposedVoiceCommand["action"], string> = {
  record_wastage: "Record wastage",
  add_expense: "Add expense",
  add_customer: "Add customer",
  record_cash_movement: "Cash drawer movement",
};

const EXAMPLES = ["Write off 3 loaves of bread, they expired", "Add an electricity expense of 40", "Add customer Sara, 555-0142", "Take 20 out of the drawer for a supplier"];

type Phase = "idle" | "recording" | "processing" | "reviewing" | "error";

export function VoiceAssistantView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [levels, setLevels] = useState<number[]>(Array(24).fill(0.08));
  const [proposed, setProposed] = useState<ProposedVoiceCommand | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const queryClient = useQueryClient();

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopVisualizer();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopVisualizer() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  function runVisualizer() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bucketSize = Math.floor(data.length / 24) || 1;
      const next = Array.from({ length: 24 }, (_, i) => {
        const start = i * bucketSize;
        const slice = data.slice(start, start + bucketSize);
        const avg = slice.reduce((s, v) => s + v, 0) / (slice.length || 1);
        return Math.max(0.08, avg / 255);
      });
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  const proposeMutation = useMutation({
    mutationFn: (blob: Blob) => proposeVoiceCommand(blob, "command.webm"),
    onSuccess: (result) => {
      setProposed(result);
      setPhase("reviewing");
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : "Couldn't process that — please try again.");
      setPhase("error");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => confirmVoiceCommand(id),
    onSuccess: () => {
      toast.success("Done — the action was applied.");
      queryClient.invalidateQueries();
      reset();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't confirm this — please try again."),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelVoiceCommand(id),
    onSuccess: () => reset(),
  });

  function reset() {
    setProposed(null);
    setErrorMessage("");
    setPhase("idle");
    setLevels(Array(24).fill(0.08));
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      runVisualizer();

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopVisualizer();
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          setPhase("idle");
          return;
        }
        setPhase("processing");
        proposeMutation.mutate(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
    } catch {
      setErrorMessage("Couldn't access your microphone — check your browser's permission for this site.");
      setPhase("error");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  const canConfirm = proposed && !(proposed.action === "record_wastage" && !proposed.args.productId);

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div
        style={{
          background: AI.navy,
          borderRadius: 20,
          padding: "34px 22px",
          textAlign: "center",
          color: "#fff",
          minHeight: 340,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        {(phase === "idle" || phase === "recording") && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            {phase === "idle" ? (
              <>
                <span style={{ width: 70, height: 70, borderRadius: 22, background: "rgba(18,161,80,.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mic size={32} color="#8FF0BB" />
                </span>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.3px" }}>Hold to speak</div>
                  <div style={{ fontSize: 12.5, color: "#AFC0CE", marginTop: 7 }}>A curated set of voice commands — wastage, expenses, new customers, cash movements</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 480 }}>
                  {EXAMPLES.map((e) => (
                    <span key={e} style={{ fontSize: 11.5, color: "#AFC0CE", background: AI.navySurface, borderRadius: 20, padding: "8px 13px" }}>
                      &ldquo;{e}&rdquo;
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#8FF0BB" }}>
                  <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#12A150" }} />
                  Listening
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4, height: 56 }}>
                  {levels.map((level, i) => (
                    <span key={i} style={{ width: 5, height: Math.max(8, level * 56), borderRadius: 3, background: "#12A150", transition: "height 75ms" }} />
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "#AFC0CE" }}>Release to send</div>
              </div>
            )}
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={(e) => {
                e.preventDefault();
                void startRecording();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopRecording();
              }}
              style={{ border: 0, background: phase === "recording" ? "#B42318" : AI.primary, borderRadius: 14, padding: "15px 30px", fontSize: 14, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 52, display: "flex", alignItems: "center", gap: 9 }}
            >
              <Mic size={19} />
              {phase === "recording" ? "Recording…" : "Hold to speak"}
            </button>
            <Link href="/assistant/chat" style={{ border: "1px solid #1D3547", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 700, color: "#AFC0CE", minHeight: 44, display: "flex", alignItems: "center" }}>
              Switch to typing
            </Link>
          </div>
        )}

        {phase === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", border: "3px solid #12A150", borderTopColor: "transparent" }} className="animate-spin" />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Transcribing and parsing your command…</div>
          </div>
        )}

        {phase === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 440 }}>
            <span style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(180,35,24,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle size={26} color="#FDA29B" />
            </span>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Couldn&apos;t process that</div>
            <div style={{ fontSize: 12.5, color: "#AFC0CE", lineHeight: 1.6 }}>{errorMessage}</div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" onClick={reset} style={{ border: 0, background: AI.primary, borderRadius: 11, padding: "12px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
                Try again
              </button>
              <Link href="/assistant/chat" style={{ border: "1px solid #1D3547", borderRadius: 11, padding: "12px 18px", fontSize: 12.5, fontWeight: 700, color: "#AFC0CE", minHeight: 46, display: "flex", alignItems: "center" }}>
                Switch to typing
              </Link>
            </div>
          </div>
        )}

        {phase === "reviewing" && proposed && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 480 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#8FF0BB" }}>
              <Check size={14} />
              Ready to review
            </span>
            <div style={{ background: AI.navySurface, borderRadius: 14, padding: 15, width: "100%", textAlign: "left" }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#8EA3B4" }}>What I heard</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.55, fontStyle: "italic" }}>&ldquo;{proposed.transcript}&rdquo;</div>
            </div>
            <div style={{ background: AI.navySurface, borderRadius: 14, padding: 15, width: "100%", textAlign: "left" }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#8EA3B4", marginBottom: 6 }}>{ACTION_LABELS[proposed.action]}</div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>{proposed.humanSummary}</div>
            </div>
            {!canConfirm && <div style={{ fontSize: 12, color: "#FDA29B" }}>Fix this before confirming — try again with a clearer product name.</div>}
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => confirmMutation.mutate(proposed.id)}
                disabled={!canConfirm || confirmMutation.isPending}
                style={{ border: 0, background: AI.primary, borderRadius: 11, padding: "12px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: !canConfirm || confirmMutation.isPending ? 0.5 : 1 }}
              >
                {confirmMutation.isPending ? "Applying…" : "Confirm and apply"}
              </button>
              <button
                type="button"
                onClick={() => cancelMutation.mutate(proposed.id)}
                disabled={cancelMutation.isPending}
                style={{ border: "1px solid #1D3547", background: "none", borderRadius: 11, padding: "12px 18px", fontSize: 12.5, fontWeight: 700, color: "#AFC0CE", cursor: "pointer", minHeight: 46, display: "flex", alignItems: "center", gap: 6 }}
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
        Nothing is written until you confirm. Supports a curated set of actions today — wastage, expenses, new customers and cash-drawer movements — not every action in Noxtill. Answers aren&apos;t spoken back; the review card above is the only response.
      </div>
    </main>
  );
}
