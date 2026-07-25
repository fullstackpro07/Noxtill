"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownContext(component: string) {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error(`<${component}> must be used inside <DropdownMenu>`);
  return ctx;
}

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerId }}>
      <div className="relative inline-block">{children}</div>
    </DropdownContext.Provider>
  );
}

export function DropdownTrigger({ children }: { children: ReactNode }) {
  const { open, setOpen, triggerId } = useDropdownContext("DropdownTrigger");
  return (
    <button
      type="button"
      id={triggerId}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className="inline-flex items-center justify-center"
    >
      {children}
    </button>
  );
}

export function DropdownContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const { open, setOpen, triggerId } = useDropdownContext("DropdownContent");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-labelledby={triggerId}
      className={cn(
        "absolute top-[calc(100%+8px)] z-50 min-w-52 rounded-[var(--radius-sm)] border border-border",
        "bg-surface p-1.5 shadow-[var(--shadow-lg)] animate-dropdown-in",
        align === "end" ? "end-0" : "start-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  active,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  active?: boolean;
  className?: string;
}) {
  const { setOpen } = useDropdownContext("DropdownItem");
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        setOpen(false);
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-[calc(var(--radius-sm)-4px)] px-3 py-2 text-start text-sm",
        "text-fg transition-colors hover:bg-surface-2",
        active && "bg-primary/8 text-primary font-medium",
        className,
      )}
    >
      {children}
    </button>
  );
}
