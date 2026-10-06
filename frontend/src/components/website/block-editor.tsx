"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { Block, BlockType } from "@/lib/website-api";
import { Btn, Field, inputClass, inputStyle } from "./website-ui";

export interface BlockEditorRefs {
  forms: { id: string; name: string; status: string }[];
  collections: { id: string; name: string }[];
  products: { id: string; name: string }[];
}

export const BLOCK_LABELS: Record<BlockType, { label: string; help: string }> = {
  hero: { label: "Hero banner", help: "Big heading, short text and a button." },
  text: { label: "Text", help: "Heading and paragraphs." },
  image: { label: "Image", help: "One image with alt text." },
  cta: { label: "Call to action", help: "A highlighted box with one button." },
  faq: { label: "FAQ", help: "Questions and answers." },
  products: { label: "Products (live)", help: "Shows products from Products with live price and availability." },
  reviews: { label: "Reviews (live)", help: "Shows recent reviews from Reviews." },
  contact: { label: "Contact (live)", help: "Phone and address from your business profile." },
  form: { label: "Form", help: "A website form that sends leads to the CRM." },
  booking: { label: "Booking button", help: "Links to your booking page." },
};

const DEFAULTS: Record<BlockType, Record<string, unknown>> = {
  hero: { heading: "", subheading: "", ctaLabel: "", ctaHref: "", imageUrl: "" },
  text: { heading: "", body: "" },
  image: { url: "", alt: "", caption: "" },
  cta: { heading: "", body: "", label: "", href: "" },
  faq: { heading: "FAQ", items: [{ q: "", a: "" }] },
  products: { heading: "Products", source: "all", collectionId: "", productIds: [], limit: 12 },
  reviews: { heading: "What customers say", minStars: 4, limit: 6 },
  contact: { heading: "Contact us", showPhone: true, showAddress: true },
  form: { heading: "Get in touch", formId: "" },
  booking: { heading: "Book an appointment", body: "", ctaLabel: "Book now" },
};

function newId() {
  return `b${Math.random().toString(36).slice(2, 9)}`;
}

function TextInput({ label, value, onChange, multiline, hint, placeholder }: { label: string; value: unknown; onChange: (v: string) => void; multiline?: boolean; hint?: string; placeholder?: string }) {
  const v = typeof value === "string" ? value : "";
  const placeholderFlag = /\[[^\]]{3,}\]/.test(v);
  return (
    <Field label={label} hint={placeholderFlag ? "Contains [placeholder] text: replace it before publishing." : hint}>
      {multiline ? (
        <textarea className={inputClass} style={{ ...inputStyle, minHeight: 90 }} value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={inputClass} style={inputStyle} value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function BlockFields({ block, set, refs }: { block: Block; set: (patch: Record<string, unknown>) => void; refs: BlockEditorRefs }) {
  const linkHint = "A page path like /about, a full https:// address, or mailto:/tel:";
  switch (block.type) {
    case "hero":
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <TextInput label="Image URL (optional)" value={block.imageUrl} onChange={(v) => set({ imageUrl: v })} placeholder="https://" />
          <div className="md:col-span-2"><TextInput label="Subheading" value={block.subheading} onChange={(v) => set({ subheading: v })} multiline /></div>
          <TextInput label="Button label" value={block.ctaLabel} onChange={(v) => set({ ctaLabel: v })} />
          <TextInput label="Button link" value={block.ctaHref} onChange={(v) => set({ ctaHref: v })} hint={linkHint} />
        </div>
      );
    case "text":
      return (
        <div className="grid gap-2">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <TextInput label="Text" value={block.body} onChange={(v) => set({ body: v })} multiline hint="Plain text. Blank lines start a new paragraph." />
        </div>
      );
    case "image":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <TextInput label="Image URL" value={block.url} onChange={(v) => set({ url: v })} placeholder="https://" />
          <TextInput label="Alt text (for screen readers)" value={block.alt} onChange={(v) => set({ alt: v })} />
          <TextInput label="Caption" value={block.caption} onChange={(v) => set({ caption: v })} />
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <TextInput label="Text" value={block.body} onChange={(v) => set({ body: v })} />
          <TextInput label="Button label" value={block.label} onChange={(v) => set({ label: v })} />
          <TextInput label="Button link" value={block.href} onChange={(v) => set({ href: v })} hint={linkHint} />
        </div>
      );
    case "faq": {
      const items = (Array.isArray(block.items) ? block.items : []) as { q: string; a: string }[];
      return (
        <div className="grid gap-2">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          {items.map((item, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-2 md:grid-cols-[1fr_1fr_auto]" style={{ borderColor: "var(--app-border)" }}>
              <TextInput label={`Question ${i + 1}`} value={item.q} onChange={(v) => set({ items: items.map((x, j) => (j === i ? { ...x, q: v } : x)) })} />
              <TextInput label="Answer" value={item.a} onChange={(v) => set({ items: items.map((x, j) => (j === i ? { ...x, a: v } : x)) })} />
              <Btn variant="ghost" aria-label={`Remove question ${i + 1}`} onClick={() => set({ items: items.filter((_, j) => j !== i) })} className="self-end">
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Btn>
            </div>
          ))}
          <Btn onClick={() => set({ items: [...items, { q: "", a: "" }] })} className="self-start">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add question
          </Btn>
        </div>
      );
    }
    case "products": {
      const ids = (block.productIds as string[]) ?? [];
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <Field label="Show">
            <select className={inputClass} style={inputStyle} value={String(block.source ?? "all")} onChange={(e) => set({ source: e.target.value })}>
              <option value="all">All visible products</option>
              <option value="collection">A collection</option>
              <option value="selected">Chosen products</option>
            </select>
          </Field>
          <Field label="Limit">
            <input type="number" min={1} max={48} className={inputClass} style={inputStyle} value={Number(block.limit ?? 12)} onChange={(e) => set({ limit: Number(e.target.value) })} />
          </Field>
          {block.source === "collection" && (
            <Field label="Collection" hint={refs.collections.length ? undefined : "No collections yet. Create one in Storefront."}>
              <select className={inputClass} style={inputStyle} value={String(block.collectionId ?? "")} onChange={(e) => set({ collectionId: e.target.value })}>
                <option value="">Choose…</option>
                {refs.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          {block.source === "selected" && (
            <div className="md:col-span-3">
              <Field label={`Products (${ids.length} chosen)`}>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
                  {refs.products.map((p) => {
                    const on = ids.includes(p.id);
                    return (
                      <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ productIds: on ? ids.filter((x) => x !== p.id) : [...ids, p.id] })} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: on ? "var(--app-primary)" : "var(--app-border)", background: on ? "var(--app-primary)" : "transparent", color: on ? "var(--app-primary-foreground)" : "var(--app-text)" }}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}
        </div>
      );
    }
    case "reviews":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <Field label="Minimum stars">
            <select className={inputClass} style={inputStyle} value={Number(block.minStars ?? 4)} onChange={(e) => set({ minStars: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★ and up</option>)}
            </select>
          </Field>
          <Field label="How many">
            <input type="number" min={1} max={12} className={inputClass} style={inputStyle} value={Number(block.limit ?? 6)} onChange={(e) => set({ limit: Number(e.target.value) })} />
          </Field>
        </div>
      );
    case "contact":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          {(["showPhone", "showAddress"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={block[k] !== false} onChange={(e) => set({ [k]: e.target.checked })} />
              {k === "showPhone" ? "Show phone" : "Show address"}
            </label>
          ))}
        </div>
      );
    case "form":
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <Field label="Form" hint={refs.forms.length ? undefined : "No forms yet. Create one in Forms & Lead Capture."}>
            <select className={inputClass} style={inputStyle} value={String(block.formId ?? "")} onChange={(e) => set({ formId: e.target.value })}>
              <option value="">Choose…</option>
              {refs.forms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}{f.status !== "active" ? " (disabled)" : ""}</option>
              ))}
            </select>
          </Field>
        </div>
      );
    case "booking":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <TextInput label="Heading" value={block.heading} onChange={(v) => set({ heading: v })} />
          <TextInput label="Text" value={block.body} onChange={(v) => set({ body: v })} />
          <TextInput label="Button label" value={block.ctaLabel} onChange={(v) => set({ ctaLabel: v })} />
        </div>
      );
  }
}

export function BlockEditor({ blocks, onChange, refs }: { blocks: Block[]; onChange: (blocks: Block[]) => void; refs: BlockEditorRefs }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const [b] = next.splice(i, 1);
    next.splice(i + d, 0, b);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No blocks yet. Add the first one below.</p>}
      {blocks.map((block, i) => (
        <div key={block.id} className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-bg)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="m-0 text-xs font-bold">
              {i + 1}. {BLOCK_LABELS[block.type].label}
              <span className="ml-2 font-normal" style={{ color: "var(--app-text-faint)" }}>{BLOCK_LABELS[block.type].help}</span>
            </p>
            <div className="flex gap-1">
              <Btn variant="ghost" aria-label="Move block up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></Btn>
              <Btn variant="ghost" aria-label="Move block down" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></Btn>
              <Btn variant="ghost" aria-label="Delete block" onClick={() => onChange(blocks.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn>
            </div>
          </div>
          <BlockFields block={block} refs={refs} set={(patch) => onChange(blocks.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b)))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>Add block:</span>
        {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
          <Btn key={type} disabled={blocks.length >= 40} onClick={() => onChange([...blocks, { id: newId(), type, ...DEFAULTS[type] } as Block])}>
            <Plus className="h-3 w-3" aria-hidden /> {BLOCK_LABELS[type].label}
          </Btn>
        ))}
      </div>
    </div>
  );
}
