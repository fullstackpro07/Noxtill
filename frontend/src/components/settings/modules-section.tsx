"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { SettingsSectionHeader } from "./settings-section-header";
import { ONBOARDING_KEYS, fetchWorkspaceModules, saveWorkspaceModules, type WorkspaceModules } from "@/lib/onboarding-api";
import { ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "@/lib/toast";
import { Icon } from "@/components/onboarding-flow/icons";

/** Workspace modules — the sidebar set chosen in onboarding, changeable anytime by the owner. */
export function ModulesSection() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ONBOARDING_KEYS.modules, queryFn: fetchWorkspaceModules });
  return (
    <div>
      <SettingsSectionHeader title="Workspace modules" description="Choose which modules appear in your sidebar. Turning a module off hides it — no data is deleted." />
      {isError ? (
        <ErrorBanner title="Couldn't load modules" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <ModulesForm initial={data} />
      )}
    </div>
  );
}

function ModulesForm({ initial }: { initial: WorkspaceModules }) {
  const qc = useQueryClient();
  const isOwner = useAuthStore((s) => s.user?.role) === "owner";
  const [on, setOn] = useState<string[]>(initial.modules.filter((m) => m.enabled).map((m) => m.id));
  const save = useMutation({
    mutationFn: () => saveWorkspaceModules(on),
    onSuccess: (res) => {
      qc.setQueryData(ONBOARDING_KEYS.modules, res);
      const business = useAuthStore.getState().business;
      if (business) useAuthStore.setState({ business: { ...business, enabledModules: res.navKeys } });
      toast.success("Sidebar updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save modules."),
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      {!initial.curated && (
        <p className="mb-4 text-sm text-fg-muted">Your workspace was set up before module selection existed, so every module is shown. Saving below limits the sidebar to the ones you keep on.</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {initial.modules.map((m) => {
          const checked = on.includes(m.id);
          return (
            <label key={m.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5" style={{ background: checked ? "#F6FBF8" : undefined, borderColor: checked ? "#9FD9BA" : undefined }}>
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                disabled={!isOwner}
                onChange={() => setOn((cur) => (checked ? cur.filter((x) => x !== m.id) : cur.concat(m.id)))}
              />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: m.tint }}>
                <Icon name={m.icon} size={19} color={m.color} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-fg">{m.name}</span>
                <span className="block text-xs text-fg-muted">{m.desc}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-muted">{isOwner ? `${on.length} selected · Dashboard and Settings are always shown.` : "Only the business owner can change modules."}</span>
        <Button type="button" onClick={() => save.mutate()} disabled={!isOwner || save.isPending || on.length === 0}>
          {save.isPending ? "Saving…" : "Save modules"}
        </Button>
      </div>
    </div>
  );
}
