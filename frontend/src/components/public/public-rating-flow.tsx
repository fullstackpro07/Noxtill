"use client";

import { useEffect, useState } from "react";
import type { PublicRatingBusiness } from "@/lib/public-rating";

type Step = "rate" | "redirecting" | "thanks" | "feedback" | "feedback-sent";

export function PublicRatingFlow({ business }: { business: PublicRatingBusiness }) {
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    if (step !== "redirecting" || !business.publicReviewUrl) return;
    const timer = setTimeout(() => {
      window.location.href = business.publicReviewUrl!;
    }, 1200);
    return () => clearTimeout(timer);
  }, [step, business.publicReviewUrl]);

  function handleRate(stars: number) {
    setRating(stars);
    if (stars >= 4) {
      setStep(business.publicReviewUrl ? "redirecting" : "thanks");
    } else {
      setStep("feedback");
    }
  }

  function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    setStep("feedback-sent");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0c4b3b] font-bold text-[#faf7f0]">
        {business.name.slice(0, 1)}
      </div>

      {step === "rate" && (
        <>
          <div>
            <h1 className="text-xl font-bold text-[#1c231e]">How was your visit to {business.name}?</h1>
            <p className="mt-1 text-sm text-[#6b6353]">Tap a star to rate your experience.</p>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => handleRate(n)}
                className="text-4xl leading-none text-[#e8a93c] transition-transform active:scale-90"
              >
                {n <= rating ? "★" : "☆"}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "redirecting" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Thank you!</h1>
          <p className="text-sm text-[#6b6353]">Taking you to leave a public review…</p>
          {business.publicReviewUrl && (
            <a href={business.publicReviewUrl} className="text-sm font-medium text-[#0c4b3b] underline">
              Tap here if you&apos;re not redirected
            </a>
          )}
        </>
      )}

      {step === "thanks" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Thank you for the {rating}-star rating!</h1>
          <p className="text-sm text-[#6b6353]">We&apos;re so glad you had a great experience. See you again soon!</p>
        </>
      )}

      {step === "feedback" && (
        <form onSubmit={handleSubmitFeedback} className="flex w-full flex-col gap-3 text-start">
          <h1 className="text-center text-xl font-bold text-[#1c231e]">We&apos;re sorry to hear that.</h1>
          <p className="text-center text-sm text-[#6b6353]">
            This won&apos;t be posted publicly — it goes straight to the owner so we can make it right.
          </p>
          <textarea
            required
            minLength={5}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={4}
            placeholder="What went wrong?"
            className="w-full rounded-xl border border-[#d8caa8] bg-white px-3.5 py-2.5 text-sm text-[#1c231e] focus:border-[#0c4b3b] focus:outline-none"
          />
          <button
            type="submit"
            disabled={feedbackText.trim().length < 5}
            className="w-full rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0] disabled:opacity-40"
          >
            Send privately
          </button>
        </form>
      )}

      {step === "feedback-sent" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Thank you — we heard you.</h1>
          <p className="text-sm text-[#6b6353]">
            Your feedback was sent privately to the owner. Nothing was posted publicly, and we&apos;ll follow up if you left contact
            details on file.
          </p>
        </>
      )}
    </div>
  );
}
