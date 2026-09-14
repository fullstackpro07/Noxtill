"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldPath, type UseFormSetError } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Lock, Store, User } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SmartIdentifierField, looksLikePhone } from "@/components/auth/smart-identifier-field";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { COUNTRIES, COUNTRY_TO_LOCALE, countryByCode } from "@/lib/countries";
import { LOCALES } from "@/lib/locales";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { login as loginRequest, signup as signupRequest, fetchMe, verifyTwoFactorLogin } from "@/lib/auth-api";
import type { AuthTokens } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";

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
  businessName: z.string().min(2, "Enter your business name"),
  businessOwnerName: z.string().min(2, "Enter your full name"),
  identifier: identifierSchema,
  password: z.string().min(8, "At least 8 characters"),
  country: z.string().min(1),
  currency: z.string().min(1),
  locale: z.string().min(1),
});
type SignupValues = z.infer<typeof signupSchema>;

function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);
  // UPD-INT-016 depth fix: the backend has always blocked login on a real 2FA-enabled account
  // (auth.service.ts's login() returns `{pending2fa, tempToken}` instead of tokens), but this
  // page previously assumed `login()` always returned tokens directly — a real 2FA user could
  // not complete login through the product UI at all. This adds the missing second step.
  const [pendingTempToken, setPendingTempToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function completeLogin(tokens: AuthTokens) {
    useAuthStore.getState().setTokens(tokens);
    const { user, business } = await fetchMe();
    setSession({ ...tokens, user, business });
    toast.success(`Welcome back, ${user.name}!`);
    router.push("/dashboard");
  }

  async function onSubmit(values: LoginValues) {
    try {
      const result = await loginRequest({ emailOrPhone: values.identifier, password: values.password });
      if ("pending2fa" in result) {
        setPendingTempToken(result.tempToken);
        return;
      }
      await completeLogin(result);
    } catch (err) {
      applyApiError(err, setError);
    }
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingTempToken) return;
    setCodeError(undefined);
    setVerifying(true);
    try {
      const tokens = await verifyTwoFactorLogin({ tempToken: pendingTempToken, code });
      await completeLogin(tokens);
    } catch (err) {
      setVerifying(false);
      setCodeError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  if (pendingTempToken) {
    return (
      // Distinct `key` from the credentials form below — both forms are structurally similar
      // (an <Input> at the same position), and without a key React reconciles them as the same
      // node across the pending2fa transition, carrying the password field's uncontrolled
      // `value={undefined}` into this controlled `value={code}` input (a real console warning
      // caught via live browser testing, UPD-INT-016).
      <form key="2fa-code" onSubmit={onVerifyCode} className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">We sent a 6-digit verification code to finish signing in.</p>
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          error={codeError}
        />
        <Button type="submit" disabled={verifying || code.length !== 6} className="mt-1 w-full">
          {verifying ? "Verifying…" : "Verify & sign in"}
        </Button>
        <button
          type="button"
          className="text-xs font-medium text-fg-faint hover:underline"
          onClick={() => {
            setPendingTempToken(null);
            setCode("");
            setCodeError(undefined);
          }}
        >
          Back to login
        </button>
      </form>
    );
  }

  return (
    <form key="credentials" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
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
    try {
      const isPhone = looksLikePhone(values.identifier);
      const tokens = await signupRequest({
        businessName: values.businessName,
        name: values.businessOwnerName,
        email: isPhone ? undefined : values.identifier,
        phone: isPhone ? values.identifier : undefined,
        password: values.password,
        country: values.country,
        currency: values.currency,
        locale: values.locale,
      });
      useAuthStore.getState().setTokens(tokens);
      const { user, business } = await fetchMe();
      setSession({ ...tokens, user, business });
      toast.success(`Welcome, ${values.businessOwnerName}!`);
      router.push("/dashboard");
    } catch (err) {
      applyApiError(err, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input
        label="Business name"
        leadingSlot={<Store className="h-4 w-4" aria-hidden />}
        error={errors.businessName?.message}
        {...register("businessName")}
      />
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
