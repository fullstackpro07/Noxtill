"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { OnboardingFlow } from "@/components/onboarding-flow/onboarding-flow";

/** Auth & Onboarding Steps 2–5 (owner only; resumes from the server-side draft). */
export default function OnboardingPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken || !user) router.replace("/login?next=/onboarding");
    else if (user.emailVerified === false) router.replace("/check-email");
    else if (user.role !== "owner") router.replace("/dashboard");
  }, [hasHydrated, accessToken, user, router]);

  if (!hasHydrated || !accessToken || !user || user.role !== "owner") return null;
  return <OnboardingFlow />;
}
