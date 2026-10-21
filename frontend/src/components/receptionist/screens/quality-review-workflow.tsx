"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  assignVoiceQualityReview,
  createVoiceQualityDraftVersion,
  createVoiceQualityRubric,
  fetchVoiceQualityOverview,
  fetchVoiceQualityReviews,
  fetchVoiceQualityRubrics,
  overrideVoiceQualityReview,
  publishVoiceQualityRubricVersion,
  saveVoiceQualityReview,
  suggestVoiceQualityReview,
  startVoiceQualityReview,
  submitVoiceQualityReview,
  type VoiceQualityCriterion,
  type VoiceQualityReview,
  type VoiceQualityRubric,
  type VoiceQualityRubricVersion,
} from "@/lib/voice-quality-api";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { Card, CardHead, Chip, EmptyState, Footnote, PrimaryBtn } from "../rx-ui";

const inputClass = "h-[34px] w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] outline-none focus:border-[#16A34A]";
const errorText = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The request could not be completed.";
const statusTone = (status: VoiceQualityReview["status"]) => status === "submitted" ? "green" : status === "overridden" ? "purple" : status === "in_progress" ? "blue" : "amber";
const maskContactDetails = (text: string) => text
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email masked]")
  .replace(/\+?\d[\d().\s-]{7,}\d/g, "[phone masked]");
const maskedNumber = (value: string) => value.length > 4 ? `•••• ${value.slice(-2)}` : "Caller number hidden";
const EMPTY_REVIEW_ROWS: VoiceQualityReview[] = [];

const initialCriteria: VoiceQualityCriterion[] = [
  { key: "accuracy", label: "Factual accuracy", weight: 50, guidance: "Compare the answer with the transcript and the business record it refers to." },
  { key: "handoff", label: "Resolution or handoff", weight: 50, guidance: "Check whether the call ended with a confirmed outcome or a clear human follow-up." },
];

interface ScoreDraft {
  score: number | null;
  evidenceTurnIndexes: number[];
  note: string;
}

export function QualityReviewWorkflow() {
  const rx = useRx();
  const queryClient = useQueryClient();
  const openCall = useRxStore((store) => store.openCall);
  const overview = useQuery({ queryKey: ["voice-quality-overview"], queryFn: fetchVoiceQualityOverview });
  const rubrics = useQuery({ queryKey: ["voice-quality-rubrics"], queryFn: fetchVoiceQualityRubrics });
  const reviews = useQuery({ queryKey: ["voice-quality-reviews"], queryFn: fetchVoiceQualityReviews });
  const [rubricName, setRubricName] = useState("");
  const [editingRubricId, setEditingRubricId] = useState("");
  const [criteria, setCriteria] = useState<VoiceQualityCriterion[]>(initialCriteria);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, Record<string, ScoreDraft>>>({});
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [notice, setNotice] = useState("");
  const [aiSuggestionDraftReviewId, setAiSuggestionDraftReviewId] = useState("");

  const rubricRows = rubrics.data ?? [];
  const reviewRows = reviews.data ?? EMPTY_REVIEW_ROWS;
  const selectedReview = reviewRows.find((review) => review.id === selectedReviewId) ?? null;
  const scoreDraft = useMemo(() => {
    if (!selectedReview) return {};
    const saved = scoreDrafts[selectedReview.id];
    if (saved) return saved;
    return Object.fromEntries(selectedReview.rubric?.criteria.map((criterion) => {
      const row = selectedReview.scores.find((score) => score.criterionKey === criterion.key);
      return [criterion.key, {
        score: row?.score ?? null,
        evidenceTurnIndexes: row?.evidenceTurnIndexes ?? [],
        note: row?.note ?? "",
      } satisfies ScoreDraft];
    }) ?? []);
  }, [scoreDrafts, selectedReview]);
  const weightTotal = criteria.reduce((total, criterion) => total + Number(criterion.weight || 0), 0);
  const eligibleCalls = useMemo(() => rx.calls.filter((call) =>
    call.status !== "in_progress" &&
    !call.recordingDeletedAt &&
    call.transcript.some((turn) => turn.text.trim()) &&
    !reviewRows.some((review) => review.call?.id === call.id),
  ), [rx.calls, reviewRows]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["voice-quality-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["voice-quality-rubrics"] }),
      queryClient.invalidateQueries({ queryKey: ["voice-quality-reviews"] }),
    ]);
  };

  const saveRubric = useMutation<VoiceQualityRubric | VoiceQualityRubricVersion>({
    mutationFn: () => {
      const payload = { name: rubricName.trim(), criteria };
      return editingRubricId
        ? createVoiceQualityDraftVersion(editingRubricId, payload)
        : createVoiceQualityRubric(payload);
    },
    onSuccess: async () => {
      setNotice(editingRubricId ? "New draft version saved" : "Rubric draft created");
      setRubricName("");
      setEditingRubricId("");
      await invalidate();
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const publish = useMutation({
    mutationFn: publishVoiceQualityRubricVersion,
    onSuccess: async () => { setNotice("Rubric version published"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const startReview = useMutation({
    mutationFn: startVoiceQualityReview,
    onSuccess: async (review) => {
      setSelectedReviewId(review.id);
      setSelectedCallId("");
      setNotice("Call assigned to you for review");
      await invalidate();
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const saveReview = useMutation({
    mutationFn: () => {
      if (!selectedReview) throw new Error("Select a review first.");
      const scores = (selectedReview.rubric?.criteria ?? []).flatMap((criterion) => {
        const draft = scoreDraft[criterion.key];
        if (!draft || draft.score == null) return [];
        return [{
          criterionKey: criterion.key,
          score: draft.score,
          evidenceTurnIndexes: draft.evidenceTurnIndexes,
          note: draft.note.trim() || undefined,
        }];
      });
      return saveVoiceQualityReview(selectedReview.id, { scores });
    },
    onSuccess: async () => { setNotice("Review saved"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const aiSuggest = useMutation({
    mutationFn: suggestVoiceQualityReview,
    onSuccess: (result, reviewId) => {
      const drafts = Object.fromEntries(result.scores.map((score) => [score.criterionKey, {
        score: score.score,
        evidenceTurnIndexes: score.evidenceTurnIndexes,
        note: score.note ?? "",
      }]));
      setScoreDrafts((current) => ({ ...current, [reviewId]: drafts }));
      setAiSuggestionDraftReviewId(reviewId);
      setNotice("AI suggestions loaded as an unsaved draft. Verify every score and citation before saving.");
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const submitReview = useMutation({
    mutationFn: () => {
      if (!selectedReview) throw new Error("Select a review first.");
      return submitVoiceQualityReview(selectedReview.id);
    },
    onSuccess: async () => { setNotice("Review submitted"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const assign = useMutation({
    mutationFn: ({ reviewId, userId }: { reviewId: string; userId: string | null }) => assignVoiceQualityReview(reviewId, userId),
    onSuccess: async () => { setNotice("Reviewer assignment updated"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const override = useMutation({
    mutationFn: () => {
      if (!selectedReview) throw new Error("Select a review first.");
      return overrideVoiceQualityReview(selectedReview.id, { score: Number(overrideScore), reason: overrideReason });
    },
    onSuccess: async () => { setNotice("Final score overridden and audited"); setOverrideReason(""); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });

  const updateCriterion = (index: number, update: Partial<VoiceQualityCriterion>) => {
    setCriteria((current) => current.map((criterion, i) => i === index ? { ...criterion, ...update } : criterion));
  };
  const updateScore = (key: string, update: Partial<ScoreDraft>) => {
    if (!selectedReview) return;
    setScoreDrafts((current) => {
      const reviewScores = current[selectedReview.id] ?? scoreDraft;
      const existing = reviewScores[key] ?? { score: null, evidenceTurnIndexes: [], note: "" };
      return { ...current, [selectedReview.id]: { ...reviewScores, [key]: { ...existing, ...update } } };
    });
  };
  const toggleEvidence = (key: string, turnIndex: number) => {
    const current = scoreDraft[key]?.evidenceTurnIndexes ?? [];
    updateScore(key, { evidenceTurnIndexes: current.includes(turnIndex) ? current.filter((index) => index !== turnIndex) : [...current, turnIndex].sort((a, b) => a - b) });
  };
  const openDraft = (rubricId: string) => {
    const rubric = rubricRows.find((row) => row.id === rubricId);
    const latest = rubric?.versions[0];
    if (!rubric || !latest || latest.publishedAt == null) return;
    setEditingRubricId(rubric.id);
    setRubricName(rubric.name);
    setCriteria(latest.criteria.map((criterion) => ({ ...criterion })));
  };
  const rubricError = rubrics.error ? errorText(rubrics.error) : null;
  const reviewError = reviews.error ? errorText(reviews.error) : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(155px,1fr))] gap-3">
        <Metric label="Calls processed · 30 days" value={overview.data ? String(overview.data.processedCalls) : "—"} />
        <Metric label="Reviews sampled · 30 days" value={overview.data ? String(overview.data.sampleCount) : "—"} />
        <Metric label="Reviewer backlog" value={overview.data ? String(overview.data.reviewBacklog) : "—"} />
        <Metric label="Missing recordings" value={overview.data ? String(overview.data.missingRecordings) : "—"} />
        <Metric label="AI versions reviewed" value={overview.data ? String(overview.data.evaluatedAgentVersions) : "—"} />
      </div>

      <Card overflow>
        <CardHead title="Quality rubric builder" sub="Versioned reviewer criteria · edits create a new draft" />
        <div className="flex flex-col gap-3 p-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto]">
            <input className={inputClass} value={rubricName} onChange={(event) => setRubricName(event.target.value)} placeholder="Rubric name" maxLength={120} />
            <div className="text-[11px] font-semibold text-[color:var(--app-text-faintest,#667085)]">Weights: {weightTotal}% {weightTotal === 100 ? "· ready" : "· must total 100%"}</div>
          </div>
          {criteria.map((criterion, index) => (
            <div key={`${index}-${criterion.key}`} className="grid gap-2 rounded-[10px] border border-[#EEF0F3] p-3 sm:grid-cols-[1fr_110px_72px_auto]">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputClass} aria-label="Criterion key" value={criterion.key} onChange={(event) => updateCriterion(index, { key: event.target.value })} placeholder="key" />
                <input className={inputClass} aria-label="Criterion label" value={criterion.label} onChange={(event) => updateCriterion(index, { label: event.target.value })} placeholder="Category label" />
                <input className={`${inputClass} sm:col-span-2`} aria-label="Criterion guidance" value={criterion.guidance} onChange={(event) => updateCriterion(index, { guidance: event.target.value })} placeholder="Reviewer guidance" />
              </div>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[#5B6675]">Weight % <input className={`${inputClass} w-[62px]`} type="number" min={1} max={100} value={criterion.weight} onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })} /></label>
              <button type="button" className="h-[34px] rounded-[8px] border border-[#D5DAE2] bg-white px-2 text-[11px] font-bold disabled:opacity-40" disabled={criteria.length <= 2} onClick={() => setCriteria((current) => current.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="h-[32px] rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[11px] font-bold" disabled={criteria.length >= 12} onClick={() => setCriteria((current) => [...current, { key: `category_${current.length + 1}`, label: "New category", weight: 1, guidance: "Describe what reviewers should verify." }])}>Add category</button>
            <PrimaryBtn disabled={saveRubric.isPending || !rubricName.trim() || criteria.length < 2 || weightTotal !== 100} onClick={() => saveRubric.mutate()}>{editingRubricId ? "Save draft version" : "Create rubric draft"}</PrimaryBtn>
            {editingRubricId ? <button type="button" className="h-[32px] rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[11px] font-bold" onClick={() => { setEditingRubricId(""); setRubricName(""); }}>Cancel edit</button> : null}
          </div>
          {rubricError ? <InlineNotice tone="error">{rubricError}</InlineNotice> : null}
          {rubricRows.length ? rubricRows.map((rubric) => (
            <div key={rubric.id} className="flex flex-wrap items-center gap-2 border-t border-[#EEF0F3] pt-3">
              <div className="min-w-[150px] flex-1 text-[12px] font-bold">{rubric.name}</div>
              {rubric.versions.map((version) => (
                <div key={version.id} className="flex items-center gap-1.5">
                  <Chip tone={version.publishedAt ? "green" : "amber"}>v{version.version} · {version.publishedAt ? "Published" : "Draft"}</Chip>
                  {!version.publishedAt ? <button type="button" className="h-[27px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[10.5px] font-bold" onClick={() => publish.mutate(version.id)} disabled={publish.isPending}>Publish</button> : null}
                </div>
              ))}
              {rubric.versions[0]?.publishedAt ? <button type="button" className="h-[27px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[10.5px] font-bold" onClick={() => openDraft(rubric.id)}>New version</button> : null}
            </div>
          )) : rubrics.isPending ? <div className="text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading rubrics…</div> : <EmptyState icon="list-checks" title="No rubric yet" body="Create and publish a reviewer rubric before assigning calls for scoring." />}
        </div>
        <Footnote>Suggested starting criteria are editable draft content, not measured business data. Published versions stay unchanged; each edit creates a new version.</Footnote>
      </Card>

      <Card overflow>
        <CardHead title="Review queue" sub="Manual reviewer scoring · every below-maximum score needs a transcript citation" />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <select aria-label="Completed call to review" className={`${inputClass} max-w-[480px]`} value={selectedCallId} onChange={(event) => setSelectedCallId(event.target.value)}>
            <option value="">Select a completed call with transcript</option>
            {eligibleCalls.map((call) => <option key={call.id} value={call.id}>{call.localDay} · {maskedNumber(call.fromNumber)} · {call.outcome}</option>)}
          </select>
          <PrimaryBtn disabled={!selectedCallId || startReview.isPending || !rubricRows.some((rubric) => rubric.versions.some((version) => !!version.publishedAt))} onClick={() => selectedCallId && startReview.mutate(selectedCallId)}>Assign to me</PrimaryBtn>
          <span className="text-[11px] text-[color:var(--app-text-faintest,#667085)]">Only calls with a saved transcript can be reviewed.</span>
        </div>
        {reviewError ? <div className="px-4 pb-4"><InlineNotice tone="error">{reviewError}</InlineNotice></div> : null}
        {reviewRows.length ? (
          <div className="grid gap-0 divide-y divide-[#EEF0F3]">
            {reviewRows.map((review) => (
              <div key={review.id} className={`flex flex-wrap items-center gap-2 px-4 py-3 ${review.id === selectedReviewId ? "bg-[#F0FDF4]" : "bg-white"}`}>
                <button type="button" className="min-w-[200px] flex-1 text-left" onClick={() => setSelectedReviewId(review.id)}>
                  <span className="block text-[12px] font-bold">{review.call ? `${maskedNumber(review.call.fromNumber)} · ${new Date(review.call.startedAt).toLocaleString()}` : "Call source unavailable"}</span>
                  <span className="mt-1 block text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">{review.rubric?.name ?? "Rubric unavailable"} · v{review.rubric?.version ?? "—"} · {review.call?.transcript.length ?? 0} transcript turns</span>
                </button>
                <Chip tone={statusTone(review.status)}>{review.status.replace("_", " ")}</Chip>
                {review.effectiveScore != null ? <span className="text-[12px] font-extrabold tabular-nums">{review.effectiveScore}/100</span> : null}
                {!review.submittedAt ? (
                  <select aria-label="Assign reviewer" className="h-[30px] max-w-[180px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[10.5px]" value={review.assignedToUserId ?? ""} onChange={(event) => assign.mutate({ reviewId: review.id, userId: event.target.value || null })}>
                    <option value="">Unassigned</option>
                    {rx.staff.filter((staff) => staff.active).map((staff) => <option key={staff.userId} value={staff.userId}>{staff.name}</option>)}
                  </select>
                ) : null}
              </div>
            ))}
          </div>
        ) : reviews.isPending ? <div className="px-4 pb-4 text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading review queue…</div> : <EmptyState icon="badge-check" title="No reviews assigned" body="Select a call above after publishing a rubric. Calls without transcripts are intentionally excluded." />}
      </Card>

      {selectedReview ? <ReviewEditor
        review={selectedReview}
        scoreDraft={scoreDraft}
        onUpdateScore={updateScore}
        onToggleEvidence={toggleEvidence}
        onSave={() => saveReview.mutate()}
        saving={saveReview.isPending}
        onSuggest={() => aiSuggest.mutate(selectedReview.id)}
        suggesting={aiSuggest.isPending}
        aiSuggestionDraft={aiSuggestionDraftReviewId === selectedReview.id}
        onSubmit={() => submitReview.mutate()}
        submitting={submitReview.isPending}
        onOverride={() => override.mutate()}
        overriding={override.isPending}
        overrideScore={overrideScore}
        setOverrideScore={setOverrideScore}
        overrideReason={overrideReason}
        setOverrideReason={setOverrideReason}
        onOpenCall={() => selectedReview.call && openCall(selectedReview.call.id)}
      /> : null}

      {overview.data ? (
        <Card pad={14}>
          <div className="text-[12px] font-extrabold">Not tracked by current call records</div>
          <div className="mt-1 text-[11px] leading-[1.6] text-[color:var(--app-text-faintest,#667085)]">Language coverage and speech-recognition accuracy benchmarks are not stored, so they are not reported. AI sentiment and confidence elsewhere are model-reported estimates, not human QA findings.</div>
        </Card>
      ) : null}
      {notice ? <InlineNotice tone={notice.toLowerCase().includes("could not") || notice.includes("must") || notice.includes("error") ? "error" : "neutral"}>{notice}</InlineNotice> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[12px] border border-[#E6E8EC] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,.04)]"><div className="text-[10.5px] font-bold text-[#5B6675]">{label}</div><div className="mt-1.5 text-[18px] font-extrabold tabular-nums text-[#0F172A]">{value}</div></div>;
}

function InlineNotice({ children, tone }: { children: ReactNode; tone: "error" | "neutral" }) {
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-[9px] border px-3 py-2 text-[11.5px] ${tone === "error" ? "border-[#FBD5D2] bg-[#FEF3F2] text-[#B42318]" : "border-[#E6E8EC] bg-[#FCFCFD] text-[#5B6675]"}`}>{children}</div>;
}

function ReviewEditor({
  review,
  scoreDraft,
  onUpdateScore,
  onToggleEvidence,
  onSave,
  saving,
  onSuggest,
  suggesting,
  aiSuggestionDraft,
  onSubmit,
  submitting,
  onOverride,
  overriding,
  overrideScore,
  setOverrideScore,
  overrideReason,
  setOverrideReason,
  onOpenCall,
}: {
  review: VoiceQualityReview;
  scoreDraft: Record<string, ScoreDraft>;
  onUpdateScore: (key: string, update: Partial<ScoreDraft>) => void;
  onToggleEvidence: (key: string, turnIndex: number) => void;
  onSave: () => void;
  saving: boolean;
  onSuggest: () => void;
  suggesting: boolean;
  aiSuggestionDraft: boolean;
  onSubmit: () => void;
  submitting: boolean;
  onOverride: () => void;
  overriding: boolean;
  overrideScore: string;
  setOverrideScore: (value: string) => void;
  overrideReason: string;
  setOverrideReason: (value: string) => void;
  onOpenCall: () => void;
}) {
  const closed = review.submittedAt != null;
  const transcript = review.call?.transcript ?? [];
  return (
    <Card overflow>
      <CardHead title="Transcript evidence & scoring" sub={`${review.rubric?.name ?? "Rubric"} · v${review.rubric?.version ?? "—"}`} right={<button type="button" onClick={onOpenCall} className="h-[29px] rounded-[7px] border border-[#D5DAE2] bg-white px-2.5 text-[10.5px] font-bold">Open call details</button>} />
      {review.call?.recordingDeleted ? <div className="m-4"><InlineNotice tone="error">This call&apos;s recording and transcript were deleted. Its QA review should no longer be available.</InlineNotice></div> : null}
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-extrabold uppercase tracking-[.06em] text-[#5B6675]">Transcript · contact details masked</div>
          {transcript.length ? transcript.map((turn) => (
            <div key={turn.index} className="rounded-[9px] border border-[#EEF0F3] bg-[#FCFCFD] p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold text-[color:var(--app-text-faintest,#667085)]"><span>{turn.speaker} · turn {turn.index + 1}</span><span>{turn.at ?? "Time not recorded"}</span></div>
              <div className="text-[12px] leading-[1.55]">{maskContactDetails(turn.text)}</div>
            </div>
          )) : <EmptyState icon="file-audio-2" title="Transcript unavailable" body="A call without transcript text cannot be scored or cited." />}
        </div>
        <div className="flex flex-col gap-3">
          {!closed ? (
            <div className="rounded-[9px] border border-[#D8E9FC] bg-[#F5FAFF] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-extrabold">AI review suggestions</div>
                <button type="button" className="h-[31px] rounded-[7px] border border-[#B8D5F5] bg-white px-2.5 text-[10.5px] font-bold disabled:opacity-50" disabled={suggesting} onClick={onSuggest}>{suggesting ? "Reviewing transcript…" : "Suggest scores with AI"}</button>
              </div>
              <div className="mt-1 text-[10.5px] leading-[1.5] text-[#5B6675]">The selected transcript and rubric are sent to Anthropic; obvious email, phone and payment-card-like numbers are masked. Suggestions stay unsaved until you verify and save them.</div>
              {aiSuggestionDraft ? <div role="status" className="mt-2 text-[10.5px] font-bold text-[#175CD3]">AI draft loaded — check every score and cited turn before saving.</div> : null}
            </div>
          ) : null}
          {(review.rubric?.criteria ?? []).map((criterion) => {
            const draft = scoreDraft[criterion.key] ?? { score: null, evidenceTurnIndexes: [], note: "" };
            return (
              <div key={criterion.key} className="rounded-[10px] border border-[#E6E8EC] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[12px] font-extrabold">{criterion.label} <span className="font-normal text-[color:var(--app-text-faintest,#667085)]">· {criterion.weight}%</span></div>
                  <select aria-label={`Score ${criterion.label}`} className="h-[31px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[11px]" disabled={closed} value={draft.score ?? ""} onChange={(event) => onUpdateScore(criterion.key, { score: event.target.value === "" ? null : Number(event.target.value) })}>
                    <option value="">Score</option>{[0, 1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} / 5</option>)}
                  </select>
                </div>
                <div className="mt-1 text-[10.5px] leading-[1.5] text-[color:var(--app-text-faintest,#667085)]">{criterion.guidance}</div>
                <input className={`${inputClass} mt-2`} aria-label={`Reviewer note ${criterion.label}`} value={draft.note} disabled={closed} onChange={(event) => onUpdateScore(criterion.key, { note: event.target.value })} placeholder="Reviewer note" maxLength={1000} />
                {draft.score != null && draft.score < 5 ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="text-[10px] font-bold text-[#B45309]">Cite one or more transcript turns for this score</div>
                    {transcript.map((turn) => <label key={turn.index} className="flex items-start gap-2 text-[10.5px] text-[#45505F]"><input type="checkbox" disabled={closed} checked={draft.evidenceTurnIndexes.includes(turn.index)} onChange={() => onToggleEvidence(criterion.key, turn.index)} /><span>Turn {turn.index + 1}: {maskContactDetails(turn.text).slice(0, 130) || "Empty turn"}</span></label>)}
                  </div>
                ) : null}
              </div>
            );
          })}
          {closed ? <div className="rounded-[9px] border border-[#EEF0F3] bg-[#FCFCFD] p-3 text-[11px] text-[#5B6675]">Computed score: <b>{review.computedScore ?? "—"}</b>/100 · final score: <b>{review.effectiveScore ?? "—"}</b>/100{review.overrideReason ? <div className="mt-1">Override reason: {review.overrideReason}</div> : null}</div> : (
            <div className="flex flex-wrap gap-2"><PrimaryBtn disabled={saving} onClick={onSave}>Save review</PrimaryBtn><PrimaryBtn disabled={submitting} onClick={onSubmit}>Submit review</PrimaryBtn></div>
          )}
          {closed ? <div className="grid gap-2 rounded-[9px] border border-[#E6E8EC] p-3">
            <div className="text-[11px] font-extrabold">Override final score · reason required</div>
            <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto]"><input className={inputClass} type="number" min={0} max={100} value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} aria-label="Override score out of 100" /><input className={inputClass} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Why is the score changing?" maxLength={2000} /><button type="button" className="h-[34px] rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[10.5px] font-bold disabled:opacity-50" disabled={overriding || overrideScore === "" || overrideReason.trim().length < 8} onClick={onOverride}>Save override</button></div>
          </div> : null}
        </div>
      </div>
      <Footnote>AI suggestions are only a starting point; a human reviewer must verify and save them. Every score below 5/5 must cite a real transcript turn. Phone numbers and email addresses are masked in the transcript view.</Footnote>
    </Card>
  );
}
