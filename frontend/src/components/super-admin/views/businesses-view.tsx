"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { saApi } from "@/lib/super-admin-api";
import { useDebounced } from "../use-debounced";
import {
  Card,
  DateInput,
  Empty,
  ErrorState,
  fmtAgo,
  fmtDate,
  Loading,
  PageHeader,
  Pagination,
  RowLink,
  SearchBox,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../ui";

function Allowance({ used, allowed }: { used: number; allowed: number | null }) {
  const over = allowed != null && used > allowed;
  return (
    <span style={{ color: over ? "var(--app-danger-strong)" : undefined, fontWeight: over ? 700 : undefined }}>
      {used} / {allowed == null ? <span title="No limit configured on the plan">Not configured</span> : allowed}
    </span>
  );
}

export function BusinessesView() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [subStatus, setSubStatus] = useState("");
  const [country, setCountry] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const params = { search: q, status, plan, subStatus, country, inactiveDays, createdFrom, createdTo, sort, page, pageSize: 25 };
  const list = useQuery({ queryKey: ["sa", "tenants", params], queryFn: () => saApi.tenants(params), placeholderData: keepPreviousData });
  const plans = useQuery({ queryKey: ["sa", "plans"], queryFn: saApi.plans });
  const countries = useQuery({ queryKey: ["sa", "countries"], queryFn: saApi.countries });
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Businesses" subtitle="Every registered business (branch groups are listed once, by their main business)." />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
          <SearchBox value={search} onChange={set(setSearch)} placeholder="Name, ID, owner, email, phone, subscription ID" />
          <Select label="Account status" value={status} onChange={set(setStatus)} options={[{ value: "", label: "Any account status" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "archived", label: "Archived" }]} />
          <Select
            label="Plan"
            value={plan}
            onChange={set(setPlan)}
            options={[{ value: "", label: "Any plan" }, ...(plans.data?.plans ?? []).map((p) => ({ value: p.key, label: p.name }))]}
          />
          <Select
            label="Subscription status"
            value={subStatus}
            onChange={set(setSubStatus)}
            options={[{ value: "", label: "Any subscription" }, ...["trialing", "active", "past_due", "paused", "cancelled"].map((s) => ({ value: s, label: s.replace("_", " ") }))]}
          />
          <Select label="Country" value={country} onChange={set(setCountry)} options={[{ value: "", label: "Any country" }, ...(countries.data ?? []).map((c) => ({ value: c, label: c }))]} />
          <Select label="Last activity" value={inactiveDays} onChange={set(setInactiveDays)} options={[{ value: "", label: "Any activity" }, { value: "7", label: "Inactive 7+ days" }, { value: "30", label: "Inactive 30+ days" }, { value: "90", label: "Inactive 90+ days" }]} />
          <DateInput label="Registered from" value={createdFrom} onChange={set(setCreatedFrom)} />
          <DateInput label="to" value={createdTo} onChange={set(setCreatedTo)} />
          <Select label="Sort" value={sort} onChange={setSort} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "name", label: "Name A–Z" }]} />
        </div>
        {list.isPending && <Loading />}
        {list.isError && <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>}
        {list.data && (
          <>
            <Table
              head={["Business", "Owner", "Country", "Plan", "Subscription", "Users", "Locations", "Modules", "Registered", "Last activity", "Account"]}
              empty={list.data.items.length === 0 && <Empty>No businesses match these filters.</Empty>}
            >
              {list.data.items.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <RowLink href={`/super-admin/businesses/${t.id}`}>{t.name}</RowLink>
                    <div className="whitespace-nowrap font-mono text-[11px]" style={{ color: "var(--app-text-disabled)" }} title={t.id}>{t.id.slice(0, 8)}…</div>
                  </Td>
                  <Td>
                    {t.owner ? (
                      <>
                        <div>{t.owner.name}</div>
                        <div className="text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>{t.owner.email ?? t.owner.phone ?? "—"}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{t.country ?? "—"}</Td>
                  <Td>{t.plan?.name ?? "—"}</Td>
                  <Td><StatusBadge status={t.subscriptionStatus} /></Td>
                  <Td><Allowance used={t.users.used} allowed={t.users.allowed} /></Td>
                  <Td><Allowance used={t.locations.used} allowed={t.locations.allowed} /></Td>
                  <Td>{t.modulesEnabled} / {t.modulesTotal}</Td>
                  <Td>{fmtDate(t.createdAt)}</Td>
                  <Td>{fmtAgo(t.lastActivityAt)}</Td>
                  <Td><StatusBadge status={t.platformStatus} /></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
