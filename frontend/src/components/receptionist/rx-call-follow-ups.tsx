"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchCallFollowUps } from "@/lib/voice-calls-api";

export function CallFollowUps({ callId }: { callId: string }) {
  const query = useQuery({
    queryKey: ["voice-call-follow-ups", callId],
    queryFn: () => fetchCallFollowUps(callId),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  if (query.error instanceof ApiError && query.error.status === 403)
    return null;
  return (
    <section
      className="max-h-48 shrink-0 overflow-y-auto border-b border-[#EEF0F3] px-5 py-3"
      aria-label="Saved support and message drafts"
    >
      <h3 className="text-xs font-bold text-[#475467]">
        Support tickets and message drafts
      </h3>
      {query.isPending ? (
        <p className="text-xs text-[color:var(--app-text-faintest,#667085)]">Loading saved follow-ups…</p>
      ) : query.error ? (
        <p role="alert" className="text-xs text-[#B42318]">
          {query.error.message}
        </p>
      ) : (
        query.data && (
          <>
            {query.data.tickets.map((ticket) => (
              <article
                key={ticket.id}
                className="mt-2 rounded border border-[#E2E6EA] p-2 text-xs"
              >
                <p className="font-bold">
                  {ticket.title} · {ticket.status}
                </p>
                <p className="whitespace-pre-wrap">{ticket.body}</p>
                <p className="text-[10px] text-[color:var(--app-text-faintest,#667085)]">Ticket {ticket.id}</p>
              </article>
            ))}
            {query.data.drafts.map((draft) => (
              <article
                key={draft.id}
                className="mt-2 rounded border border-[#E2E6EA] p-2 text-xs"
              >
                <p className="font-bold">
                  Message draft · {draft.status} · not sent
                </p>
                <p className="whitespace-pre-wrap">{draft.body}</p>
                <p className="text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                  Draft {draft.id}. Staff must review and use the normal
                  messaging consent checks before sending.
                </p>
              </article>
            ))}
            {!query.data.tickets.length && !query.data.drafts.length && (
              <p className="mt-1 text-xs text-[color:var(--app-text-faintest,#667085)]">
                No support ticket or message draft was created from this call.
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
