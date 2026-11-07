"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BUSINESS_MODULES_QUERY_KEY, fetchBusinessModules } from "@/lib/business-modules-api";
import { navItemForPath, NAV_ITEMS } from "@/lib/nav-items";
import { useSession } from "@/lib/session";
import { useTranslation } from "@/hooks/use-translation";

/** Pages that stay reachable even when their module is off (the sidebar's Help card links here). */
const ALWAYS_REACHABLE = ["/assistant/help"];

const ALL_OPTIONAL_MODULES = new Set(NAV_ITEMS.map((item) => item.key).filter((key) => key !== "dashboard"));

export function useBusinessModulesQuery() {
  return useQuery({ queryKey: BUSINESS_MODULES_QUERY_KEY, queryFn: fetchBusinessModules, staleTime: 60_000 });
}

/** Fail closed while module access is unknown; legacy businesses resolve to all-on from the API. */
export function useDisabledModules(): ReadonlySet<string> {
  const query = useBusinessModulesQuery();
  return useMemo(
    () => new Set(query.isError ? ALL_OPTIONAL_MODULES : query.data?.disabled ?? ALL_OPTIONAL_MODULES),
    [query.data, query.isError],
  );
}

/** Shows a notice instead of a page whose module the business has turned off. */
export function ModuleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const modulesQuery = useBusinessModulesQuery();
  const session = useSession();
  const { t } = useTranslation();
  const item = navItemForPath(pathname);
  const reachable = ALWAYS_REACHABLE.some((href) => pathname === href || pathname.startsWith(`${href}/`));
  if (!item || reachable || item.key === "dashboard") return <>{children}</>;

  if (modulesQuery.isPending) {
    return <div className="p-6 text-sm" role="status" style={{ color: "var(--app-text-muted)" }}>Checking module access…</div>;
  }
  if (modulesQuery.isError || !modulesQuery.data) {
    return (
      <div className="flex min-h-full items-center justify-center p-6" style={{ color: "var(--app-text)" }}>
        <div className="max-w-md rounded-2xl border p-6 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <h1 className="m-0 text-lg font-bold">Module access couldn&apos;t be checked</h1>
          <p className="m-0 mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>Reconnect to Noxtill and try again. Your module settings have not been changed.</p>
          <button type="button" onClick={() => void modulesQuery.refetch()} className="mt-4 rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
        </div>
      </div>
    );
  }

  const label = t(item.labelKey);
  const platform = modulesQuery.data.platform?.[item.key];

  if (platform?.state === "restricted") {
    return (
      <>
        <div role="status" className="border-b px-6 py-2 text-[12.5px] font-semibold" style={{ background: "var(--app-warning-bg)", borderColor: "var(--app-warning-border)", color: "var(--app-warning-text)" }}>
          {label} is read-only for this business (set by Noxtill). You can view and export, but changes are blocked. Contact Noxtill support.
        </div>
        {children}
      </>
    );
  }

  if (!modulesQuery.data.disabled.includes(item.key)) return <>{children}</>;

  if (platform) {
    return (
      <div className="flex min-h-full items-center justify-center p-6" style={{ color: "var(--app-text)" }}>
        <div className="max-w-md rounded-2xl border p-6 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <h1 className="m-0 text-lg font-bold">{label} is unavailable</h1>
          <p className="m-0 mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
            {platform.state === "global_disabled"
              ? `${label} is temporarily unavailable on Noxtill. Your data is safe.`
              : `${label} has been suspended for this business by Noxtill. Your data is safe — contact Noxtill support.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6" style={{ color: "var(--app-text)" }}>
      <div className="max-w-md rounded-2xl border p-6 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <h1 className="m-0 text-lg font-bold">{label} is turned off</h1>
        <p className="m-0 mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
          This business doesn&rsquo;t use {label} right now, so it&rsquo;s hidden. Turning a module off never deletes its data.
        </p>
        {session.user.role === "owner" ? (
          <Link href="/settings/modules" className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: "var(--app-primary)" }}>
            Turn it on in Settings → Modules
          </Link>
        ) : (
          <p className="m-0 mt-4 text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Ask the business owner to turn it on.</p>
        )}
      </div>
    </div>
  );
}
