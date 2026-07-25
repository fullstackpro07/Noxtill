"use client";

import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SmartIdentifierField, looksLikePhone } from "@/components/auth/smart-identifier-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { COUNTRIES, COUNTRY_TO_LOCALE, countryByCode } from "@/lib/countries";
import { LOCALES } from "@/lib/locales";
import { toast } from "@/lib/toast";

const identifierSchema = z
  .string()
  .min(1, "Enter your email or phone number")
  .refine(
    (v) => (looksLikePhone(v) ? v.replace(/[^\d]/g, "").length >= 7 : /\S+@\S+\.\S+/.test(v)),
    "Enter a valid email or phone number",
  );

const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, "Enter your password"),
});
type LoginValues = z.infer<typeof loginSchema>;

const signupSchema = z.object({
  businessOwnerName: z.string().min(2, "Enter your full name"),
  identifier: identifierSchema,
  password: z.string().min(8, "At least 8 characters"),
  country: z.string().min(1),
  currency: z.string().min(1),
  locale: z.string().min(1),
});
type SignupValues = z.infer<typeof signupSchema>;

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    await new Promise((r) => setTimeout(r, 500));
    toast.info(`Live login wires up in INT-001 — got "${values.identifier}"`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <SmartIdentifierField
        value={watch("identifier") ?? ""}
        {...register("identifier")}
        error={errors.identifier?.message}
      />
      <Input
        label="Password"
        type={showPassword ? "text" : "password"}
        leadingSlot={<Lock className="h-4 w-4" aria-hidden />}
        trailingSlot={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="pointer-events-auto"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        }
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="flex justify-end">
        <button type="button" className="text-xs font-medium text-primary hover:underline">
          Forgot password?
        </button>
      </div>
      <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignupForm() {
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { country: "US", currency: "USD", locale: "en" },
  });

  const password = watch("password") ?? "";
  const country = watch("country");

  // Country change re-suggests currency/language, but only while the user hasn't touched those fields themselves.
  const touchedCurrency = useRef(false);
  const touchedLocale = useRef(false);

  function handleCountryChange(code: string) {
    setValue("country", code);
    const c = countryByCode(code);
    if (!touchedCurrency.current) setValue("currency", c.currency);
    if (!touchedLocale.current) setValue("locale", COUNTRY_TO_LOCALE[code] ?? "en");
  }

  async function onSubmit(values: SignupValues) {
    await new Promise((r) => setTimeout(r, 500));
    toast.info(`Live signup wires up in INT-001 — welcome, ${values.businessOwnerName}!`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input
        label="Your name"
        leadingSlot={<User className="h-4 w-4" aria-hidden />}
        error={errors.businessOwnerName?.message}
        {...register("businessOwnerName")}
      />
      <SmartIdentifierField
        value={watch("identifier") ?? ""}
        {...register("identifier")}
        error={errors.identifier?.message}
      />
      <div>
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          leadingSlot={<Lock className="h-4 w-4" aria-hidden />}
          trailingSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="pointer-events-auto"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          }
          error={errors.password?.message}
          {...register("password")}
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label="Country" value={country} onChange={(e) => handleCountryChange(e.target.value)}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Currency"
          {...register("currency", {
            onChange: () => {
              touchedCurrency.current = true;
            },
          })}
        >
          {Array.from(new Set(COUNTRIES.map((c) => c.currency))).map((cur) => (
            <option key={cur} value={cur}>
              {cur}
            </option>
          ))}
        </Select>
        <Select
          label="Language"
          {...register("locale", {
            onChange: () => {
              touchedLocale.current = true;
            },
          })}
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting ? "Creating account…" : "Create your account"}
      </Button>
      <p className="text-center text-xs text-fg-faint">
        14-day free trial, no card required.
      </p>
    </form>
  );
}

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const tabItems = useMemo(
    () => [
      { key: "login", label: "Log in" },
      { key: "signup", label: "Sign up" },
    ],
    [],
  );

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-fg">
        {tab === "login" ? "Welcome back" : "Set up your business"}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        {tab === "login" ? "Log in to your Noxtill dashboard." : "Takes about 2 minutes."}
      </p>

      <Tabs items={tabItems} value={tab} onChange={(k) => setTab(k as "login" | "signup")} className="my-6" />

      {tab === "login" ? <LoginForm /> : <SignupForm />}
    </div>
  );
}
