"use client";

import { REQUEST_SECTION } from "@/lib/marketing/integrations-content";

export function IntegrationsRequestForm() {
  return (
    <form className="flex min-w-[280px] flex-[1_1_330px] flex-col gap-3.5" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-fg">{REQUEST_SECTION.fields.tool.label}</span>
        <input
          type="text"
          placeholder={REQUEST_SECTION.fields.tool.placeholder}
          className="h-11 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-fg">{REQUEST_SECTION.fields.website.label}</span>
        <input
          type="url"
          placeholder={REQUEST_SECTION.fields.website.placeholder}
          className="h-11 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-fg">{REQUEST_SECTION.fields.sync.label}</span>
        <input
          type="text"
          placeholder={REQUEST_SECTION.fields.sync.placeholder}
          className="h-11 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-fg">{REQUEST_SECTION.fields.help.label}</span>
        <textarea
          rows={2}
          placeholder={REQUEST_SECTION.fields.help.placeholder}
          className="resize-y rounded-[10px] border border-border-strong bg-surface-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>
      <button type="submit" className="h-11 rounded-[10px] bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover">
        {REQUEST_SECTION.submitLabel}
      </button>
    </form>
  );
}
