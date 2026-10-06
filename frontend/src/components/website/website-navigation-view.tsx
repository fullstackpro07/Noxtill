"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerDownRight, Eye, EyeOff, Plus, Save, Send, Trash2 } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { websiteApi, type NavItem, type Navigation } from "@/lib/website-api";
import { Btn, Card, Empty, Field, Notice, Page, StatusBadge, errorText, inputClass, inputStyle } from "./website-ui";

const TYPES: { value: NavItem["type"]; label: string }[] = [
  { value: "page", label: "Website page" },
  { value: "store", label: "Online store" },
  { value: "blog", label: "Blog" },
  { value: "booking", label: "Booking page" },
  { value: "portal", label: "Customer portal" },
  { value: "url", label: "Custom link" },
];

function newItem(): NavItem {
  return { id: `n${Math.random().toString(36).slice(2, 9)}`, label: "New link", type: "page" };
}

export function WebsiteNavigationView() {
  useModuleHeader({ title: "Navigation & Menus", subtitle: "Header and footer menus that link to your pages and modules" });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["website", "navigation"], queryFn: websiteApi.navigation });
  const [edited, setNav] = useState<Navigation | null>(null);
  const nav = edited ?? q.data?.draft ?? null;
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => websiteApi.saveNavigation(nav!),
    onSuccess: () => {
      setMessage({ tone: "ok", text: "Menu saved as a draft. Publish to make it live." });
      setNav(null);
      void qc.invalidateQueries({ queryKey: ["website"] });
    },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });
  const publish = useMutation({
    mutationFn: () => websiteApi.publishSite({ navigation: true }),
    onSuccess: (d) => {
      setMessage({ tone: "ok", text: `Menu published (deployment #${d.number}).` });
      void qc.invalidateQueries({ queryKey: ["website"] });
    },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });

  if (q.isLoading || !nav) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !q.data) return <Page><Notice tone="danger">{errorText(q.error)}</Notice></Page>;
  const dirty = JSON.stringify(nav) !== JSON.stringify(q.data.draft);
  const pages = q.data.pages;

  const editList = (key: keyof Navigation, items: NavItem[]) => setNav({ ...nav, [key]: items });

  const renderList = (key: keyof Navigation, items: NavItem[], depth = 0, parentUpdate?: (items: NavItem[]) => void) => {
    const update = parentUpdate ?? ((next: NavItem[]) => editList(key, next));
    return (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item, i) => {
          const change = (patch: Partial<NavItem>) => update(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          const issue = q.data.issues.find((iss) => iss.itemId === item.id);
          const page = pages.find((p) => p.id === item.pageId);
          return (
            <li key={item.id} style={{ marginLeft: depth * 20 }}>
              <div className="grid items-end gap-2 rounded-xl border p-2 md:grid-cols-[1fr_1fr_1.4fr_auto]" style={{ borderColor: issue ? "var(--app-warning-border)" : "var(--app-border)", background: "var(--app-bg)" }}>
                <Field label={depth ? "Sub-item label" : "Label"}>
                  <input className={inputClass} style={inputStyle} value={item.label} onChange={(e) => change({ label: e.target.value })} />
                </Field>
                <Field label="Goes to">
                  <select className={inputClass} style={inputStyle} value={item.type} onChange={(e) => change({ type: e.target.value as NavItem["type"], pageId: undefined, url: undefined })}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {item.type === "page" ? (
                  <Field label="Page" hint={issue ? issue.problem : page ? page.path : undefined}>
                    <select className={inputClass} style={inputStyle} value={item.pageId ?? ""} onChange={(e) => change({ pageId: e.target.value })}>
                      <option value="">Choose a page…</option>
                      {pages.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.kind}, {p.status})</option>)}
                    </select>
                  </Field>
                ) : item.type === "url" ? (
                  <Field label="Link" hint="https://… or a path on this site like /about">
                    <input className={inputClass} style={inputStyle} value={item.url ?? ""} onChange={(e) => change({ url: e.target.value })} />
                  </Field>
                ) : (
                  <p className="m-0 self-center text-[11px]" style={{ color: "var(--app-text-faint)" }}>Links to the {TYPES.find((t) => t.value === item.type)?.label.toLowerCase()} owned by its module.</p>
                )}
                <div className="flex gap-1">
                  <Btn variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; update(n); }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Btn>
                  <Btn variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; update(n); }}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Btn>
                  <Btn variant="ghost" aria-label={item.hidden ? "Show item" : "Hide item"} aria-pressed={!!item.hidden} onClick={() => change({ hidden: !item.hidden })}>{item.hidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}</Btn>
                  {depth === 0 && <Btn variant="ghost" aria-label="Add sub-item" onClick={() => change({ children: [...(item.children ?? []), newItem()] })}><CornerDownRight className="h-3.5 w-3.5" aria-hidden /></Btn>}
                  <Btn variant="ghost" aria-label="Remove item" onClick={() => update(items.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn>
                </div>
              </div>
              {item.children?.length ? <div className="mt-2">{renderList(key, item.children, depth + 1, (children) => change({ children }))}</div> : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const hidden = [...nav.header, ...nav.footer].flatMap((i) => [i, ...(i.children ?? [])]).filter((i) => i.hidden).length;

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>Menus: {nav.header.length + nav.footer.length} items · {hidden} hidden · {q.data.issues.length} broken</span>
        {q.data.changed ? <StatusBadge status="pending" label="Draft differs from live" /> : <StatusBadge status="live" label="Live menu matches draft" />}
        <span className="ml-auto flex gap-2">
          <Btn onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save className="h-3.5 w-3.5" aria-hidden /> Save draft</Btn>
          <Btn variant="primary" onClick={() => publish.mutate()} disabled={dirty || !q.data.changed || publish.isPending} title={dirty ? "Save first" : undefined}><Send className="h-3.5 w-3.5" aria-hidden /> Publish menus</Btn>
        </span>
      </div>
      {q.data.issues.length > 0 && <Notice tone="warn">Menu items pointing to pages that aren&rsquo;t published will block publishing: {q.data.issues.map((i) => `${i.label} (${i.problem.toLowerCase()})`).join(", ")}.</Notice>}

      {(["header", "footer"] as const).map((key) => (
        <Card key={key} title={key === "header" ? "Header menu (also used on mobile)" : "Footer links"} actions={<Btn onClick={() => editList(key, [...nav[key], newItem()])} disabled={nav[key].length >= (key === "header" ? 12 : 20)}><Plus className="h-3.5 w-3.5" aria-hidden /> Add item</Btn>}>
          {nav[key].length === 0 ? <Empty>No items yet.</Empty> : renderList(key, nav[key])}
        </Card>
      ))}
      <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Links to pages use the page&rsquo;s id, so renaming a page&rsquo;s slug never breaks the menu. Use the arrow buttons (keyboard accessible) to reorder.</p>
    </Page>
  );
}
