"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadVideoTestimonial, type PublicVideoTestimonialRequest } from "@/lib/public-video-testimonial-api";
import { ApiError } from "@/lib/api-client";

type Step = "pick" | "ready" | "uploading" | "thanks" | "error";

export function PublicVideoTestimonialFlow({ token, business }: { token: string; business: PublicVideoTestimonialRequest }) {
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadVideoTestimonial(token, f),
    onSuccess: () => setStep("thanks"),
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
      setStep("error");
    },
  });

  function handleFileSelected(f: File) {
    setFile(f);
    setStep("ready");
  }

  function handleUpload() {
    if (!file) return;
    setStep("uploading");
    uploadMutation.mutate(file);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0c4b3b] font-bold text-[#faf7f0]">
        {business.businessName.slice(0, 1)}
      </div>

      {(step === "pick" || step === "ready") && (
        <>
          <div>
            <h1 className="text-xl font-bold text-[#1c231e]">Share a quick video for {business.businessName}?</h1>
            <p className="mt-1 text-sm text-[#6b6353]">
              {business.caption ?? "Just a short clip about your experience — 30 seconds is plenty."}
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
            }}
          />

          {step === "pick" && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0]"
            >
              Record or choose a video
            </button>
          )}

          {step === "ready" && file && (
            <div className="flex w-full flex-col gap-3">
              <video src={URL.createObjectURL(file)} controls className="w-full rounded-xl bg-black" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setStep("pick");
                  }}
                  className="flex-1 rounded-full border border-[#d8caa8] px-5 py-3 text-sm font-medium text-[#1c231e]"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="flex-1 rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0]"
                >
                  Upload
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === "uploading" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Uploading…</h1>
          <p className="text-sm text-[#6b6353]">Hang tight, this can take a moment on a slower connection.</p>
        </>
      )}

      {step === "thanks" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Thank you!</h1>
          <p className="text-sm text-[#6b6353]">Your video was sent — {business.businessName} will review it before it&apos;s shared anywhere.</p>
        </>
      )}

      {step === "error" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Something went wrong</h1>
          <p className="text-sm text-[#6b6353]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setStep(file ? "ready" : "pick")}
            className="rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0]"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
