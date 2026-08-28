"use client";

import { useState } from "react";
import { useForm, type FieldPath, type UseFormSetError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { submitBookDemo } from "@/lib/marketing/book-demo-api";
import { SOLUTIONS_BUSINESS_TYPES, SOLUTIONS_MORE_BUSINESS_TYPES } from "@/lib/marketing/nav-links";
import { toast } from "@/lib/toast";

const BUSINESS_TYPES = [...SOLUTIONS_BUSINESS_TYPES, ...SOLUTIONS_MORE_BUSINESS_TYPES];

const bookDemoSchema = z.object({
  name: z.string().min(1, "Enter your name"),
  businessName: z.string().min(1, "Enter your business name"),
  email: z.string().min(1, "Enter your email").email("Enter a valid email"),
  phone: z.string().optional(),
  businessType: z.string().optional(),
  message: z.string().optional(),
  website: z.string().optional(),
});
type BookDemoValues = z.infer<typeof bookDemoSchema>;

const inputClass =
  "h-11 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

/** Maps the backend's {fields: {name: [msg]}} validation shape onto react-hook-form fields; falls back to a toast for anything else. */
function applyApiError<T extends Record<string, unknown>>(err: unknown, setError: UseFormSetError<T>) {
  if (!(err instanceof ApiError)) {
    toast.error("Something went wrong — please try again.");
    return;
  }
  if (err.fields) {
    for (const [field, messages] of Object.entries(err.fields)) {
      setError(field as FieldPath<T>, { message: messages[0] });
    }
    return;
  }
  toast.error(err.message);
}

export function BookDemoForm() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookDemoValues>({ resolver: zodResolver(bookDemoSchema) });

  async function onSubmit(values: BookDemoValues) {
    try {
      await submitBookDemo(values);
      setSubmitted(true);
    } catch (err) {
      applyApiError(err, setError);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[#cfeede] bg-surface-tint p-8 text-center sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
          <Check className="h-6 w-6 text-white" aria-hidden strokeWidth={2.5} />
        </span>
        <h2 className="font-display text-xl font-semibold text-fg">Thanks — we&apos;ll be in touch</h2>
        <p className="max-w-[46ch] text-[14.5px] leading-relaxed text-fg-muted">
          Someone from our team will reach out within one business day to schedule your demo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-white p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Your name*</span>
          <input type="text" className={inputClass} {...register("name")} />
          {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Business name*</span>
          <input type="text" className={inputClass} {...register("businessName")} />
          {errors.businessName && <span className="text-xs text-destructive">{errors.businessName.message}</span>}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Work email*</span>
          <input type="email" className={inputClass} {...register("email")} />
          {errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg">Phone (optional)</span>
          <input type="tel" className={inputClass} {...register("phone")} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-fg">Business type (optional)</span>
        <select className={inputClass} defaultValue="" {...register("businessType")}>
          <option value="">Select your business type</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type.label} value={type.label}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-fg">What are you hoping to solve? (optional)</span>
        <textarea rows={3} className={`resize-y py-2.5 ${inputClass} h-auto`} {...register("message")} />
      </label>

      {/* Honeypot — hidden from real visitors, left blank; a filled value is silently discarded server-side. */}
      <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden {...register("website")} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary text-[15px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-70"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {isSubmitting ? "Sending…" : "Book a Demo"}
      </button>
    </form>
  );
}
