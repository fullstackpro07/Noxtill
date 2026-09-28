"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { approveAction, prepareAction, watchFinding, type FindingCard } from "@/lib/brain-api";
import { useBrainStore } from "./brain-store";
import { errorText, useBrainInvalidate } from "./brain-ui";

/** Every per-finding control on every screen goes through these, so they behave the same everywhere. */
export function useFindingActions() {
  const router = useRouter();
  const flash = useBrainStore((s) => s.flash);
  const branch = useBrainStore((s) => s.branch);
  const openModal = useBrainStore((s) => s.openModal);
  const setCause = useBrainStore((s) => s.setCause);
  const close = useBrainStore((s) => s.close);
  const invalidate = useBrainInvalidate();

  const prepare = useMutation({
    mutationFn: (f: FindingCard) => prepareAction(f.key, branch),
    onSuccess: (r) => {
      flash(r.existing ? "Already prepared — it is waiting in the Action Center." : "Prepared. Nothing has been sent or changed — review it in the Action Center.");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });
  const watch = useMutation({
    mutationFn: (f: FindingCard) => watchFinding(f.key, f.t, branch),
    onSuccess: (r) => {
      flash(r.rule ? "Moved to the watchlist — you will be told when it moves." : "Marked as watching. It stays listed with a Watching badge.");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });
  const approve = useMutation({
    mutationFn: (id: string) => approveAction(id),
    onSuccess: () => {
      flash("Approved. It runs only when someone presses Run in the Action Center.");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });

  return {
    prepare,
    watch,
    approve,
    dismiss: (f: FindingCard) => openModal({ type: "dismiss", key: f.key, title: f.t }),
    diagnose: (f: FindingCard) => {
      close();
      setCause({ topic: f.diagnose ?? "profit" });
      router.push("/business-brain/cause");
    },
    /** The finding's main call to action: prepare its action, else diagnose, else open its screen. */
    primary: (f: FindingCard) => {
      if (f.action && !f.action.prepared) prepare.mutate(f);
      else if (f.action?.prepared) router.push("/business-brain/actions");
      else if (f.diagnose) {
        setCause({ topic: f.diagnose });
        router.push("/business-brain/cause");
      } else if (f.link) router.push(f.link.href);
    },
    primaryLabel: (f: FindingCard) => (f.action ? (f.action.prepared ? "Prepared — review it" : f.action.label) : f.diagnose ? "Diagnose" : (f.link?.label ?? "Open")),
  };
}
