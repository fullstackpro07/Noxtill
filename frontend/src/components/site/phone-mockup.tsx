import type { ReactNode } from "react";

export function PhoneMockup({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="relative rounded-[38px] border-[6px] border-[#1c231e] bg-[#1c231e] shadow-[var(--shadow-lg)]">
        <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#1c231e]" />
        <div className="relative overflow-hidden rounded-[32px] bg-surface">
          <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[11px] font-semibold text-fg">
            <span>10:02</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3.5 rounded-[1px] border border-current" />
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-current" />
            </span>
          </div>
          <div className="h-[520px] overflow-hidden">{children}</div>
        </div>
        <div className="absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-fg-faint/40" />
      </div>
    </div>
  );
}
