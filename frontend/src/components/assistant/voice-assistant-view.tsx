"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  proposeVoiceCommand,
  confirmVoiceCommand,
  cancelVoiceCommand,
  type ProposedVoiceCommand,
} from "@/lib/voice-command-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const ACTION_LABELS: Record<ProposedVoiceCommand["action"], string> = {
  record_wastage: "Record wastage",
  add_expense: "Add expense",
  add_customer: "Add customer",
  record_cash_movement: "Cash drawer movement",
};

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
    onSuccess: () => {
      reset();
    },
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
    <div className="flex flex-col items-center gap-8 py-8">
      {phase === "idle" || phase === "recording" ? (
        <>
          <div className="flex h-24 items-end gap-1">
            {levels.map((level, i) => (
              <span
                key={i}
                className={`w-1.5 rounded-full transition-all duration-75 ${phase === "recording" ? "bg-primary" : "bg-surface-2"}`}
                style={{ height: `${Math.max(8, level * 96)}px` }}
              />
            ))}
          </div>
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
            className={`flex h-24 w-24 items-center justify-center rounded-full shadow-[var(--shadow-lg)] transition-colors ${
              phase === "recording" ? "bg-destructive text-white" : "bg-primary text-primary-foreground"
            }`}
          >
            <Mic className="h-8 w-8" aria-hidden />
          </button>
          <p className="text-sm text-fg-muted">
            {phase === "recording" ? "Listening — release to send" : "Hold to speak a command"}
          </p>
          <p className="max-w-sm text-center text-xs text-fg-faint">
            Try: &ldquo;Write off 3 loaves of bread, they expired&rdquo; · &ldquo;Add a 40 dollar electricity
            expense&rdquo; · &ldquo;Add customer Sara, 555-0142&rdquo; · &ldquo;Take 20 out of the drawer for a
            supplier&rdquo;
          </p>
        </>
      ) : phase === "processing" ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-fg-muted">Transcribing and parsing your command…</p>
        </div>
      ) : phase === "error" ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="max-w-sm text-sm text-destructive">{errorMessage}</p>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      ) : (
        proposed && (
          <div className="w-full max-w-md rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">{ACTION_LABELS[proposed.action]}</p>
            <p className="mt-2 text-sm italic text-fg-faint">&ldquo;{proposed.transcript}&rdquo;</p>
            <p className="mt-3 text-base font-medium text-fg">{proposed.humanSummary}</p>
            {!canConfirm && (
              <p className="mt-2 text-xs text-destructive">Fix this before confirming — try again with a clearer product name.</p>
            )}
            <div className="mt-5 flex items-center gap-2">
              <Button
                onClick={() => confirmMutation.mutate(proposed.id)}
                disabled={!canConfirm || confirmMutation.isPending}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {confirmMutation.isPending ? "Applying…" : "Confirm"}
              </Button>
              <Button variant="ghost" onClick={() => cancelMutation.mutate(proposed.id)} disabled={cancelMutation.isPending}>
                <X className="h-3.5 w-3.5" aria-hidden />
                Cancel
              </Button>
            </div>
          </div>
        )
      )}

      <p className="max-w-sm text-center text-xs text-fg-faint">
        Nothing is written until you confirm. Supports a curated set of actions today — wastage, expenses, new
        customers, and cash-drawer movements — not every action in Noxtill yet. There&apos;s no typed fallback yet:
        this screen is voice-only, since the backend command parser only accepts real audio.
      </p>
    </div>
  );
}
