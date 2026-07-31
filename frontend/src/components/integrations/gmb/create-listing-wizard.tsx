"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

const STEPS = ["Business info", "Address", "Category", "Verify"];

export function CreateListingWizard() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Sunset Hair Studio");

  const isLast = step === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      toast.success("Listing submitted for verification. Live create wires up in INT-013.");
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="mx-auto max-w-md rounded-[var(--radius-noxtill)] border border-border bg-surface p-6 text-center">
      <p className="mb-1 font-display text-lg font-bold text-fg">No Google listing yet</p>
      <p className="mb-5 text-sm text-fg-muted">Let&apos;s create one — it only takes a few steps.</p>

      <div className="mb-5 flex items-center justify-center gap-1.5">
        {STEPS.map((label, i) => (
          <span key={label} className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-primary" : "bg-surface-2"}`} />
        ))}
      </div>

      <div className="mb-5 text-start">
        <p className="mb-3 text-sm font-medium text-fg">{STEPS[step]}</p>
        {step === 0 && <Input label="Business name" value={name} onChange={(e) => setName(e.target.value)} />}
        {step === 1 && <Input label="Address" placeholder="482 Elm Street, Springfield" />}
        {step === 2 && <Input label="Primary category" placeholder="Hair salon" />}
        {step === 3 && <p className="text-sm text-fg-muted">Google will mail a postcard with a verification code to your address.</p>}
      </div>

      <Button className="w-full" onClick={handleNext}>
        {isLast ? "Submit for verification" : "Continue"}
      </Button>
    </div>
  );
}
