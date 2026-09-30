"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Workspace } from "@/lib/helpdesk-api";
import { useHd, useHdInvalidate } from "./hd-store";
import { TABS, errText } from "./hd-core";

export function useHdActions(ws: Workspace | undefined) {
  const router = useRouter();
  const invalidate = useHdInvalidate();
  const set = useHd((s) => s.set);
  const flash = useHd((s) => s.flash);
  const openModal = useHd((s) => s.openModal);

  const can = useCallback((cap: string) => !!ws?.me.caps[cap], [ws]);
  const manager = (ws?.me.ri ?? 2) <= 1;

  const go = useCallback(
    (key: string, number?: string) => {
      set({ drawer: null, dMore: false });
      const href = key === "detail" && number ? `/helpdesk/tickets/${encodeURIComponent(number)}` : (TABS.find((t) => t[0] === key)?.[2] ?? "/helpdesk");
      router.push(href);
    },
    [router, set],
  );

  const openTicket = useCallback(
    (number: string) => {
      set({ comp: { mode: "public", text: "", files: [], after: "", articles: [] }, tl: "all", split: null });
      go("detail", number);
    },
    [go, set],
  );

  /**
   * Runs a server write. Success closes the modal and refetches; failure keeps everything as it
   * was and shows the server's reason — never a fake success.
   */
  const call = useCallback(
    async <T,>(label: string, fn: () => Promise<T>, ok?: (r: T) => string | void): Promise<T | undefined> => {
      if (useHd.getState().busy) return undefined;
      set({ busy: true, modalErr: null });
      try {
        const r = await fn();
        set({ busy: false, modal: null, modalErr: null });
        const msg = ok?.(r);
        if (msg) flash(msg);
        await invalidate();
        return r;
      } catch (e) {
        const msg = `${label} failed — ${errText(e)}`;
        if (useHd.getState().modal) set({ busy: false, modalErr: errText(e) });
        else {
          set({ busy: false });
          flash(msg);
        }
        return undefined;
      }
    },
    [set, flash, invalidate],
  );

  const tfGo = useCallback(
    (patch: Record<string, string>) => {
      set({ tf: { q: "", st: "", pri: "", ch: "", cat: "", agent: "", queue: "", br: "", sla: "", date: "", cust: "", tag: "", ...patch }, page: 0, sel: [] });
      go("tickets");
    },
    [set, go],
  );

  return useMemo(() => ({ can, manager, go, openTicket, call, tfGo, flash, openModal, invalidate, set }), [can, manager, go, openTicket, call, tfGo, flash, openModal, invalidate, set]);
}

export type HdActions = ReturnType<typeof useHdActions>;
