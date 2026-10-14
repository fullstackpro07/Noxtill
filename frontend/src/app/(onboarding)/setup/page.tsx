import { redirect } from "next/navigation";

/** The old 5-step setup wizard was replaced by the AI onboarding flow (Auth & Onboarding design). */
export default function LegacySetupPage() {
  redirect("/onboarding");
}
