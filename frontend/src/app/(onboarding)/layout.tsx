import { nxJakarta as jakarta } from "@/fonts";
import "@/components/auth-flow/auth-flow.css";

/** Layout B shell — each onboarding screen renders its own green panel + content column. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`nx-flow ${jakarta.variable}`}>{children}</div>;
}
