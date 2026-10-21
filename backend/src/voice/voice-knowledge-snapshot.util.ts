import { createHash } from 'crypto';

export type VoiceKnowledgeSnapshot = {
  id: string;
  title: string;
  kind: 'faq' | 'document';
  content: string;
  contentHash: string;
  updatedAt: string;
};

export function snapshotKnowledge(row: {
  id: string;
  title: string;
  kind: 'faq' | 'document';
  content: string;
  updatedAt: Date;
}): VoiceKnowledgeSnapshot {
  return {
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    contentHash: createHash('sha256')
      .update(JSON.stringify([row.title, row.kind, row.content]))
      .digest('hex'),
  };
}

/** Deterministic lexical selector over the immutable corpus; never searches other tenants. */
export function selectKnowledgeSnapshot(
  snapshots: VoiceKnowledgeSnapshot[],
  text: string,
) {
  const words = [
    ...new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []),
  ];
  if (!words.length) return null;
  return (
    snapshots
      .map((snapshot) => {
        const title = snapshot.title.toLocaleLowerCase();
        const body = snapshot.content.toLocaleLowerCase();
        return {
          snapshot,
          score: words.reduce(
            (total, word) =>
              total +
              (title.includes(word) ? 2 : 0) +
              (body.includes(word) ? 1 : 0),
            0,
          ),
        };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.snapshot.id.localeCompare(b.snapshot.id),
      )[0]?.snapshot ?? null
  );
}
