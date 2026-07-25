"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MapPin, MessageCircle, Phone, Smartphone, Store, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WizardProgress } from "@/components/onboarding/wizard-progress";
import { BusinessTypePicker } from "@/components/onboarding/business-type-picker";
import { useOnboardingStore } from "@/store/onboarding-store";
import { toast } from "@/lib/toast";

const STEP_LABELS = ["Business type", "Profile", "Branding", "Team", "Messaging"];
/** Every step is skippable except step 1 (index 0) — FE-006. */
const REQUIRED_STEPS = new Set([0]);

function StepBusinessType() {
  const { data, updateData } = useOnboardingStore();
  return (
    <div>
      <h2 className="font-display text-xl font-bold text-fg">What kind of business do you run?</h2>
      <p className="mt-1 text-sm text-fg-muted">This shapes the dashboard, terminology, and default templates.</p>
      <div className="mt-6">
        <BusinessTypePicker
          value={data.businessTypeKey}
          onChange={(key, label) => updateData({ businessTypeKey: key, businessTypeLabel: label })}
        />
      </div>
    </div>
  );
}

function StepProfile() {
  const { data, updateData } = useOnboardingStore();
  return (
    <div>
      <h2 className="font-display text-xl font-bold text-fg">Tell us about your business</h2>
      <p className="mt-1 text-sm text-fg-muted">Shown on receipts, booking pages, and customer messages.</p>
      <div className="mt-6 flex flex-col gap-4">
        <Input
          label="Business name"
          leadingSlot={<Store className="h-4 w-4" aria-hidden />}
          value={data.businessName}
          onChange={(e) => updateData({ businessName: e.target.value })}
          placeholder="Sunset Hair Studio"
        />
        <Input
          label="Phone number"
          leadingSlot={<Phone className="h-4 w-4" aria-hidden />}
          value={data.businessPhone}
          onChange={(e) => updateData({ businessPhone: e.target.value })}
          placeholder="+1 555 000 0000"
        />
        <Input
          label="Address"
          leadingSlot={<MapPin className="h-4 w-4" aria-hidden />}
          value={data.address}
          onChange={(e) => updateData({ address: e.target.value })}
          placeholder="123 Main St, Springfield"
        />
      </div>
    </div>
  );
}

const BRAND_COLORS = ["#0C4B3B", "#B94A3D", "#1B4965", "#7A4419", "#5B3A8E", "#2B6B4A"];

function StepBranding() {
  const { data, updateData } = useOnboardingStore();
  return (
    <div>
      <h2 className="font-display text-xl font-bold text-fg">Pick a brand color</h2>
      <p className="mt-1 text-sm text-fg-muted">Used on your invoices, booking page, and review widget.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {BRAND_COLORS.map((color) => {
          const selected = data.brandColor === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => updateData({ brandColor: color })}
              aria-label={`Choose ${color}`}
              aria-pressed={selected}
              className={cn(
                "h-12 w-12 rounded-full transition-transform hover:scale-105",
                selected && "outline-2 outline-offset-2",
              )}
              style={{ backgroundColor: color, outlineColor: selected ? color : undefined }}
            />
          );
        })}
      </div>
      <div
        className="mt-6 rounded-[var(--radius-noxtill)] p-5 text-sm font-medium text-white shadow-[var(--shadow-sm)]"
        style={{ backgroundColor: data.brandColor }}
      >
        This is roughly how your brand color will look on customer-facing pages.
      </div>
    </div>
  );
}

function StepTeam() {
  const { data, updateData } = useOnboardingStore();
  const [email, setEmail] = useState("");

  function addEmail() {
    const trimmed = email.trim();
    if (!trimmed || data.teamEmails.includes(trimmed)) return;
    updateData({ teamEmails: [...data.teamEmails, trimmed] });
    setEmail("");
  }

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-fg">Invite your team</h2>
      <p className="mt-1 text-sm text-fg-muted">Optional — you can always add staff later from Settings.</p>
      <div className="mt-6 flex gap-2">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEmail();
            }
          }}
          placeholder="teammate@business.com"
          leadingSlot={<Mail className="h-4 w-4" aria-hidden />}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={addEmail}>
          Add
        </Button>
      </div>
      {data.teamEmails.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {data.teamEmails.map((e) => (
            <li
              key={e}
              className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1.5 ps-3 pe-1.5 text-sm text-fg"
            >
              {e}
              <button
                type="button"
                onClick={() => updateData({ teamEmails: data.teamEmails.filter((x) => x !== e) })}
                aria-label={`Remove ${e}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-fg-faint hover:bg-border hover:text-fg"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CHANNELS: { key: "whatsapp" | "sms" | "email"; label: string; icon: typeof MessageCircle; tone: string }[] = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, tone: "bg-whatsapp text-whatsapp-foreground" },
  { key: "sms", label: "SMS", icon: Smartphone, tone: "bg-primary text-primary-foreground" },
  { key: "email", label: "Email", icon: Mail, tone: "bg-accent text-accent-foreground" },
];

function StepMessaging() {
  const { data, updateData } = useOnboardingStore();
  return (
    <div>
      <h2 className="font-display text-xl font-bold text-fg">How should we reach your customers?</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Your preferred channel, with automatic fallback if a message can&apos;t be delivered.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CHANNELS.map(({ key, label, icon: Icon, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => updateData({ messagingChannel: key })}
            className={cn(
              "flex flex-col items-center gap-2.5 rounded-[var(--radius-noxtill)] border p-5 transition-all",
              data.messagingChannel === key
                ? "border-primary bg-primary/6"
                : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", tone)}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-display text-sm font-semibold text-fg">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SetupWizardPage() {
  const router = useRouter();
  const { step, setStep, data, reset } = useOnboardingStore();

  const isLastStep = step === STEP_LABELS.length - 1;
  const canContinue = !REQUIRED_STEPS.has(step) || !!data.businessTypeKey;

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function handleSkip() {
    if (REQUIRED_STEPS.has(step)) return;
    if (isLastStep) return finish();
    setStep(step + 1);
  }

  function handleContinue() {
    if (!canContinue) return;
    if (isLastStep) return finish();
    setStep(step + 1);
  }

  function finish() {
    toast.success("You're all set! Live save wires up in INT-001.");
    reset();
    router.push("/dashboard");
  }

  return (
    <div>
      <WizardProgress step={step} labels={STEP_LABELS} />

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-6 sm:p-8">
        {step === 0 && <StepBusinessType />}
        {step === 1 && <StepProfile />}
        {step === 2 && <StepBranding />}
        {step === 3 && <StepTeam />}
        {step === 4 && <StepMessaging />}

        <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
          <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 0}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            {!REQUIRED_STEPS.has(step) && (
              <Button type="button" variant="ghost" onClick={handleSkip}>
                Skip for now
              </Button>
            )}
            <Button type="button" onClick={handleContinue} disabled={!canContinue}>
              {isLastStep ? "Finish setup" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
