import { MessageCircle, Sparkles } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-primary px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        {/* Ambient texture: soft radial glow + faint dot grid, not a stock gradient */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 15%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 55%), radial-gradient(circle at 85% 85%, color-mix(in srgb, var(--whatsapp) 25%, transparent), transparent 50%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            color: "var(--primary-foreground)",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary-foreground font-display text-base font-bold text-primary">
            N
          </div>
          <span className="font-display text-lg font-bold text-primary-foreground">Noxtill</span>
        </div>

        <div className="relative max-w-md space-y-6">
          <h1 className="font-display text-4xl font-bold leading-[1.1] text-primary-foreground">
            Run your whole business from one WhatsApp-first dashboard.
          </h1>
          <p className="text-[15px] leading-relaxed text-primary-foreground/75">
            Sales, bookings, credit, reviews, and marketing — built for the shop, salon, and
            restaurant owners who live in WhatsApp, not spreadsheets.
          </p>

          <div className="flex items-center gap-3 rounded-[var(--radius-noxtill)] bg-primary-foreground/10 p-4 backdrop-blur-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-whatsapp">
              <MessageCircle className="h-4.5 w-4.5 text-whatsapp-foreground" aria-hidden />
            </div>
            <p className="text-sm text-primary-foreground/90">
              &ldquo;Your table for 4 is confirmed for 8:00 PM tonight!&rdquo;
            </p>
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-primary-foreground/60">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Trusted by local businesses across 12+ countries
        </div>
      </section>

      <section className="flex items-center justify-center bg-bg px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </div>
  );
}
