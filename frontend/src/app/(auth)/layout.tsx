import { Plus_Jakarta_Sans } from "next/font/google";
import "@/components/auth-flow/auth-flow.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nx-jakarta",
});

/** Layout A (Auth & Onboarding design): minimal white page, one centered card, no marketing panel. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`nx-flow ${jakarta.variable}`}>
      <main
        className="nx-auth-zoom"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 20px 100px",
          gap: 18,
          background: "#fff",
        }}
      >
        {children}
      </main>
    </div>
  );
}
