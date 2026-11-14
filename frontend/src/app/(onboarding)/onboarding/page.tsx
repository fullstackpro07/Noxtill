"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { OnboardingFlow } from "@/components/onboarding-flow/onboarding-flow";

/** Auth & Onboarding Steps 2–5 (owner only; resumes from the server-side draft). */
export default function OnboardingPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || !user) router.replace("/login?next=/onboarding");
    else if (user.emailVerified === false) router.replace("/check-email");
    else if (user.role !== "owner") router.replace("/dashboard");
  }, [hasHydrated, isAuthenticated, user, router]);

  if (!hasHydrated || !isAuthenticated || !user || user.role !== "owner") return null;
  return <OnboardingFlow />;
}
