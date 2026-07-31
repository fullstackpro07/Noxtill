import { Check } from "lucide-react";
import { ASSISTANT_MODULE } from "@/lib/landing-content";
import { AssistantChatPanel } from "./assistant-chat-panel";

export function AssistantModuleSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">{ASSISTANT_MODULE.eyebrow}</p>
          <h2 className="mt-2 text-balance font-display text-3xl font-bold leading-tight text-fg sm:text-4xl">{ASSISTANT_MODULE.headline}</h2>
          <p className="mt-4 text-fg-muted">{ASSISTANT_MODULE.body}</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {ASSISTANT_MODULE.checks.map((check) => (
              <li key={check} className="flex items-start gap-2 text-sm text-fg">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {check}
              </li>
            ))}
          </ul>
        </div>

        <AssistantChatPanel />
      </div>
    </section>
  );
}
