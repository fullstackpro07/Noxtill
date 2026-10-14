import { Plus_Jakarta_Sans } from "next/font/google";
import "@/components/auth-flow/auth-flow.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nx-jakarta",
});

/** Layout B shell — each onboarding screen renders its own green panel + content column. */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`nx-flow ${jakarta.variable}`}>{children}</div>;
}
