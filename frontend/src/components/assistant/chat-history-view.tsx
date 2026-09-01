"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchAssistantConversations,
  fetchAssistantConversation,
  deleteAssistantConversation,
  type AssistantConversationSummary,
} from "@/lib/assistant-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STOPWORDS = new Set([
  "the", "a", "an", "how", "do", "i", "is", "are", "to", "for", "of", "in", "on", "my",
  "what", "when", "why", "can", "does", "and", "or", "this", "that", "with",
]);

/** A simple client-side word-frequency heuristic, not an AI-classified topic — there's no topic-tagging in the backend, so this reads the most common significant word across conversation titles. */
function mostAskedTopic(conversations: AssistantConversationSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const c of conversations) {
    const words = c.title.toLowerCase().match(/[a-z]+/g) ?? [];
    for (const w of words) {
      if (w.length < 4 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [word, count] of counts) {
    if (count > bestCount) {
      best = word;
      bestCount = count;
    }
  }
  return best;
}

export function ChatHistoryView() {
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AssistantConversationSummary | null>(null);
  const queryClient = useQueryClient();

  const { data: conversations = [], isPending, isError, refetch } = useQuery({
    queryKey: ["assistant-conversations"],
    queryFn: fetchAssistantConversations,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAssistantConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assistant-conversations"] });
      toast.success("Conversation deleted.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this conversation — please try again."),
  });

  const totalQuestions = conversations.reduce((sum, c) => sum + c.questionCount, 0);
  const topic = useMemo(() => mostAskedTopic(conversations), [conversations]);

  if (isError) {
    return <ErrorBanner title="Couldn't load conversations" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Conversations" value={String(conversations.length)} />
            <StatCard label="Questions asked" value={String(totalQuestions)} />
            <StatCard label="Most-asked word" value={topic ?? "—"} />
          </>
        )}
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No conversations yet" description="Chats with the Assistant will show up here." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Conversation</th>
                <th className="px-4 py-3 text-start">Questions</th>
                <th className="px-4 py-3 text-start">Last activity</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-fg">{c.title}</td>
                  <td className="px-4 py-3 text-fg-muted">{c.questionCount}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(c.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setViewing(c.id)}>
                        Open
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <ConversationDialog id={viewing} onClose={() => setViewing(null)} />}

      {deleting && (
        <Dialog
          open
          onClose={() => setDeleting(null)}
          title="Delete this conversation?"
          description={`"${deleting.title}" will be permanently removed.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteMutation.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 truncate font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

function ConversationDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: conversation, isPending } = useQuery({
    queryKey: ["assistant-conversation", id],
    queryFn: () => fetchAssistantConversation(id),
  });

  return (
    <Dialog open onClose={onClose} title={conversation?.title ?? "Conversation"} className="max-w-lg">
      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {conversation?.messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "self-end" : "self-start"}>
              <div
                className={`max-w-[85%] rounded-[var(--radius-noxtill)] px-3.5 py-2.5 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-2 text-fg"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
