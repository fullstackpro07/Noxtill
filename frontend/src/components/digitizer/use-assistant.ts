"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { askDigitizerAssistant, type AssistantAnswer } from "@/lib/digitizer-api";
import { useDigitizerStore } from "./digitizer-store";
import type { PanelConfig } from "./digitizer-types";

export function panelFromAnswer(a: AssistantAnswer, go: (href: string) => void, close: () => void): PanelConfig {
  return {
    kicker: "AI document assistant",
    title: a.title,
    badge: a.source === "data" ? "Worked out from your documents" : "AI answer — check anything important",
    badgeTone: a.source === "data" ? "purple" : "amber",
    answerLabel: "Answer",
    answer: a.answer,
    rows: a.rows.map((r): [string, string] | [string, string, "pos" | "neg" | "muted" | undefined] => (r[2] ? [r[0], r[1], r[2]] : [r[0], r[1]])),
    bulletsTitle: a.bullets.length ? (a.source === "data" ? "How this was determined" : "Evidence") : undefined,
    bullets: a.bullets,
    note: a.note || undefined,
    primary: a.primary?.label ?? "Close",
    onPrimary: a.primary
      ? () => {
          close();
          go(a.primary!.href);
        }
      : undefined,
    secondary: a.primary ? "Close" : undefined,
  };
}

/** Asks the assistant a canned question (`key`) or a free-form one, and shows the answer in the side panel. */
export function useAskAssistant() {
  const router = useRouter();
  const { openPanel, closePanel, notifyError } = useDigitizerStore();
  const [asking, setAsking] = useState(false);

  const ask = useCallback(
    async (input: { key?: string; question?: string }) => {
      setAsking(true);
      try {
        const answer = await askDigitizerAssistant(input);
        openPanel(panelFromAnswer(answer, (href) => router.push(href), closePanel));
      } catch (e) {
        notifyError("The assistant could not answer", e instanceof Error ? e.message : "Please try again.");
      } finally {
        setAsking(false);
      }
    },
    [openPanel, closePanel, notifyError, router],
  );

  return { ask, asking };
}
