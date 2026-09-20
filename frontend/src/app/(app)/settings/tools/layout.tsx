import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/** Full-page editors that Settings links out to (templates, keys, billing…). */
export default function SettingsToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/settings" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Settings
      </Link>
      {children}
    </div>
  );
}
