"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { submitPublicReview, type PublicReviewBusiness } from "@/lib/public-review-api";
import { ApiError } from "@/lib/api-client";

type Step = "rate" | "redirecting" | "thanks" | "feedback" | "feedback-sent" | "error";

export function PublicRatingFlow({ token, business }: { token: string; business: PublicReviewBusiness }) {
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const submitMutation = useMutation({
    mutationFn: (input: { stars: number; message?: string }) => submitPublicReview(token, input.stars, input.message),
    onSuccess: (result) => {
      if ("redirect" in result) {
        setRedirectUrl(result.redirect);
        setStep("redirecting");
      } else {
        // The API only decides thank-you vs. redirect once the rating is submitted — a low
        // rating always lands here (routed to private feedback); a high rating lands here only
        // when the business hasn't configured a public review destination ("private mode").
        setStep(rating >= 4 ? "thanks" : "feedback-sent");
      }
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
      setStep("error");
    },
  });

  useEffect(() => {
    if (step !== "redirecting" || !redirectUrl) return;
    const timer = setTimeout(() => {
      window.location.href = redirectUrl;
    }, 1200);
    return () => clearTimeout(timer);
  }, [step, redirectUrl]);

  function handleRate(stars: number) {
    setRating(stars);
    if (stars >= 4) {
      submitMutation.mutate({ stars });
    } else {
      setStep("feedback");
    }
  }

  function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    submitMutation.mutate({ stars: rating, message: feedbackText.trim() });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0c4b3b] font-bold text-[#faf7f0]">
        {business.businessName.slice(0, 1)}
      </div>

      {step === "rate" && (
        <>
          <div>
            <h1 className="text-xl font-bold text-[#1c231e]">How was your visit to {business.businessName}?</h1>
            <p className="mt-1 text-sm text-[#6b6353]">Tap a star to rate your experience.</p>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                disabled={submitMutation.isPending}
                onClick={() => handleRate(n)}
                className="text-4xl leading-none text-[#e8a93c] transition-transform active:scale-90 disabled:opacity-50"
              >
                {n <= rating ? "★" : "☆"}
              </button>
            ))}
          </div>
          {submitMutation.isPending && <p className="text-xs text-[#6b6353]">Submitting…</p>}
        </>
      )}

      {step === "redirecting" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Thank you!</h1>
          <p className="text-sm text-[#6b6353]">Taking you to leave a public review…</p>
          {redirectUrl && (
            <a href={redirectUrl} className="text-sm font-medium text-[#0c4b3b] underline">
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
            disabled={feedbackText.trim().length < 5 || submitMutation.isPending}
            className="w-full rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0] disabled:opacity-40"
          >
            {submitMutation.isPending ? "Sending…" : "Send privately"}
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

      {step === "error" && (
        <>
          <h1 className="text-xl font-bold text-[#1c231e]">Something went wrong</h1>
          <p className="text-sm text-[#6b6353]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setStep(rating >= 4 || rating === 0 ? "rate" : "feedback")}
            className="rounded-full bg-[#0c4b3b] px-5 py-3 text-sm font-medium text-[#faf7f0]"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
