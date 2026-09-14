"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, DollarSign, AlertTriangle, CalendarDays, Star, MessageSquareWarning, Wallet } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  NIGHTLY_CLOSE_SECTIONS,
  NIGHTLY_CLOSE_SECTION_LABEL,
  updateNightlyCloseSettings,
  type NightlyCloseSection,
  type NightlyCloseSettings,
} from "@/lib/nightly-close-api";
import { SlideDrawer } from "./slide-drawer";

const SECTION_ICON: Record<NightlyCloseSection, typeof DollarSign> = {
  sales: DollarSign,
  lowStock: AlertTriangle,
  appointmentsTomorrow: CalendarDays,
  newReviews: Star,
  openFeedback: MessageSquareWarning,
  creditPayments: Wallet,
};

const arrowBtnStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 8, color: "var(--app-text-faint)", background: "var(--app-surface)" };

export function NightlyCloseSectionsDrawer({ open, onClose, current }: { open: boolean; onClose: () => void; current?: NightlyCloseSettings }) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<NightlyCloseSection[]>(current?.config.sections ?? [...NIGHTLY_CLOSE_SECTIONS]);
  const [enabled, setEnabled] = useState<Set<NightlyCloseSection>>(new Set(current?.config.sections ?? NIGHTLY_CLOSE_SECTIONS));

  useEffect(() => {
    if (current) {
      const on = current.config.sections;
      const off = NIGHTLY_CLOSE_SECTIONS.filter((s) => !on.includes(s));
      setOrder([...on, ...off]);
      setEnabled(new Set(on));
    }
  }, [current]);

  function move(section: NightlyCloseSection, dir: -1 | 1) {
    setOrder((list) => {
      const i = list.indexOf(section);
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = list.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function toggle(section: NightlyCloseSection) {
    setEnabled((set) => {
      const next = new Set(set);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () => updateNightlyCloseSettings({ sections: order.filter((s) => enabled.has(s)) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nightly-close-settings"] });
      toast.success("Nightly Close sections saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save sections — please try again."),
  });

  return (
    <SlideDrawer open={open} onClose={onClose} title="Nightly Close Sections">
      <div className="flex flex-col gap-2.5">
        <p className="mb-1 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Reorder with the arrows, or switch a section off to leave it out of tonight's close.</p>
        {order.map((section, i) => {
          const Icon = SECTION_ICON[section];
          const on = enabled.has(section);
          return (
            <div key={section} className="flex items-center gap-2.5 rounded-[12px] p-[11px_12px]" style={{ background: "#FCFDFD", border: "1px solid var(--app-border)", opacity: on ? 1 : 0.55 }}>
              <Icon className="h-[15px] w-[15px] shrink-0" style={{ color: "var(--app-primary)" }} aria-hidden />
              <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{NIGHTLY_CLOSE_SECTION_LABEL[section]}</span>
              <button type="button" onClick={() => move(section, -1)} disabled={i === 0} aria-label="Move up" className="flex h-[26px] w-[26px] items-center justify-center disabled:opacity-40" style={arrowBtnStyle}>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button type="button" onClick={() => move(section, 1)} disabled={i === order.length - 1} aria-label="Move down" className="flex h-[26px] w-[26px] items-center justify-center disabled:opacity-40" style={arrowBtnStyle}>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label="Enable section"
                onClick={() => toggle(section)}
                className="relative h-[21px] w-[38px] shrink-0 rounded-full"
                style={{ background: on ? "var(--app-primary)" : "var(--app-border-strong)" }}
              >
                <span className="absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white transition-all" style={{ left: on ? 19 : 2 }} />
              </button>
            </div>
          );
        })}
        <div className="mt-1.5 flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              setOrder([...NIGHTLY_CLOSE_SECTIONS]);
              setEnabled(new Set(NIGHTLY_CLOSE_SECTIONS));
            }}
            className="flex-1 rounded-[10px] py-[10px] text-[12.5px] font-semibold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
          >
            Reset to Default
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 rounded-[10px] py-[10px] text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </SlideDrawer>
  );
}
