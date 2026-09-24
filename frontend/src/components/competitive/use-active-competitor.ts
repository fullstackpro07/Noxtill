"use client";

import { useEffect } from "react";
import type { CompetitorStats } from "@/lib/competitive-insights";
import { useCompetitiveData } from "./competitive-data";
import { useCompetitiveUi } from "./competitive-store";

/**
 * The competitor the Profile / Comparison screens are showing: the one picked from a card, else the
 * first competitor. Falls back cleanly when the picked one has since been removed.
 */
export function useActiveCompetitor(): { active: CompetitorStats | null; setActive: (id: string) => void } {
  const { stats } = useCompetitiveData();
  const id = useCompetitiveUi((s) => s.activeCompetitorId);
  const setActive = useCompetitiveUi((s) => s.setActiveCompetitor);
  const active = stats.find((s) => s.competitor.id === id) ?? stats[0] ?? null;

  useEffect(() => {
    if (active && active.competitor.id !== id) setActive(active.competitor.id);
  }, [active, id, setActive]);

  return { active, setActive };
}
