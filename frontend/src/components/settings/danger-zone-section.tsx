"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "./settings-section-header";
import { DestructiveConfirmDialog } from "@/components/shared/destructive-confirm-dialog";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

/** Every action here is permanent and irreversible — each gets its own typed-confirm dialog, never a plain "Are you sure?". */
export function DangerZoneSection() {
  const router = useRouter();
  const session = useSession();
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    await new Promise((r) => setTimeout(r, 700));
    setPending(false);
    setDialogOpen(false);
    toast.success("Account deletion scheduled. Live delete wires up in INT-005.");
    router.push("/login");
  }

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.dangerZone.label")}
        description={t("settings.section.dangerZone.description")}
      />

      <div className="rounded-[var(--radius-noxtill)] border border-destructive/25 bg-destructive/[0.03] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-fg">{t("settings.dangerZone.deleteAccount")}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{t("settings.dangerZone.deleteDescription")}</p>
          </div>
          <Button variant="destructive" onClick={() => setDialogOpen(true)} className="shrink-0">
            {t("settings.dangerZone.deleteButton")}
          </Button>
        </div>
      </div>

      <DestructiveConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
        title={`${t("settings.dangerZone.deleteAccount")}?`}
        description="This cannot be undone. Every sale, customer, and setting tied to this business will be permanently erased."
        confirmPhrase={session.business.slug}
        confirmLabel={t("settings.dangerZone.deleteButton")}
        pending={pending}
      />
    </div>
  );
}
