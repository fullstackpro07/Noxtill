"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { askConfirm, askText } from "@/lib/ask-dialog";
import {
  decideVoiceMeetingGuest,
  endVoiceMeeting,
  fetchVoiceMeetingArtifacts,
  fetchVoiceMeetingLobby,
  moderateVoiceMeetingGuest,
  prepareVoiceMeetingRecording,
  requestVoiceMeetingAiArtifacts,
  createVoiceMeetingFollowUpDraft,
  startVoiceMeetingRecording,
  stopVoiceMeetingRecording,
} from "@/lib/voice-meetings-api";

export function VoiceMeetingHostControls({ meetingId }: { meetingId: string }) {
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["voice-meeting-lobby", meetingId], queryFn: () => fetchVoiceMeetingLobby(meetingId), refetchInterval: 5000, retry: false });
  const artifacts = useQuery({ queryKey: ["voice-meeting-artifacts", meetingId], queryFn: () => fetchVoiceMeetingArtifacts(meetingId), refetchInterval: 10000, retry: false });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["voice-meeting-lobby", meetingId] }),
      client.invalidateQueries({ queryKey: ["voice-meeting-artifacts", meetingId] }),
      client.invalidateQueries({ queryKey: ["voice-meetings"] }),
    ]);
  };
  const command = useMutation({
    mutationFn: async ({ participantId, action }: { participantId?: string; action: "admitted" | "denied" | "mute" | "remove" | "end" }) => {
      const reason = action === "admitted" ? "Host admitted this personal guest invitation" : await askText({ title: action === "end" ? "End this meeting for everyone?" : `${action === "mute" ? "Mute" : action === "remove" ? "Remove" : "Deny"} this guest?`, description: "Enter a reason for the audited host action. A provider request is not proof that the participant has disconnected.", minLength: 8, confirmLabel: action === "end" ? "End meeting" : "Confirm" });
      if (!reason) return;
      if (action === "end") {
        const result = await endVoiceMeeting(meetingId, reason);
        setMessage(result.status === "ended" ? "The provider confirmed that the room ended." : "Ending requested. Waiting for provider confirmation; new joins are blocked.");
      } else if (participantId && (action === "admitted" || action === "denied")) {
        await decideVoiceMeetingGuest(meetingId, participantId, action, reason);
        setMessage(action === "admitted" ? "Invitation admitted. This is not a connected-media receipt." : "The guest request was denied.");
      } else if (participantId && (action === "mute" || action === "remove")) {
        setMessage((await moderateVoiceMeetingGuest(meetingId, participantId, action, reason)).message);
      }
    },
    onSuccess: refresh,
    onError: (error) => setMessage(error.message),
  });
  const recording = useMutation({
    mutationFn: async (action: "prepare" | "start" | "stop") => {
      if (action === "prepare") {
        const policy = query.data?.recordingPolicy;
        if (!policy?.allowed || !policy.notice?.trim()) throw new Error("This meeting has no active published recording policy.");
        const accepted = await askConfirm({
          title: `Consent to record under ${policy.countryCode} policy v${policy.version}?`,
          description: `${policy.notice}\n\nThis records your consent and asks connected guests to decide. No recording starts until every connected participant agrees. The policy does not confirm a guest's country or legal jurisdiction.`,
          confirmLabel: "I consent and request guest consent",
        });
        if (!accepted) return null;
        return prepareVoiceMeetingRecording(meetingId);
      }
      if (action === "start") return startVoiceMeetingRecording(meetingId);
      const reason = await askText({ title: "Stop meeting recording", description: "The file remains unavailable until LiveKit confirms completion and private storage confirms the uploaded object.", minLength: 8, confirmLabel: "Request stop" });
      if (!reason) return null;
      return stopVoiceMeetingRecording(meetingId, reason);
    },
    onSuccess: async (result) => {
      if (result) setMessage(result.message ?? `Recording state: ${result.status}.`);
      await refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const meetingAi = useMutation({
    mutationFn: async ({ recordingId, action }: { recordingId: string; action: "process" | "draft" }) => {
      if (action === "process") {
        const accepted = await askConfirm({
          title: "Transcribe and summarize this recording?",
          description: "The audio will be sent to the configured speech transcription provider and the transcript to the configured AI provider. This may incur usage charges. Personal details are redacted before storage. Results remain visible only for review and are never sent automatically.",
          confirmLabel: "Process recording",
        });
        if (!accepted) return null;
        return requestVoiceMeetingAiArtifacts(meetingId, recordingId);
      }
      const accepted = await askConfirm({
        title: "Save the follow-up as an unsent inbox draft?",
        description: "This creates a draft linked to the meeting's customer. It will not be sent, and a person must review it first.",
        confirmLabel: "Save unsent draft",
      });
      if (!accepted) return null;
      return createVoiceMeetingFollowUpDraft(meetingId, recordingId);
    },
    onSuccess: async (result) => {
      if (result) setMessage("sent" in result ? "Unsent follow-up draft saved for review." : result.message);
      await refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const button = "rounded-md border border-[#D5DAE2] bg-white px-2 py-1 text-xs font-semibold disabled:opacity-50";
  if (query.isPending) return <p className="mt-3 text-xs">Loading host controls…</p>;
  if (query.error) return <p role="alert" className="mt-3 text-xs text-[#B42318]">{query.error.message}</p>;
  if (!query.data) return null;
  const ended = query.data.roomState === "ended" || Boolean(query.data.endRequestedAt);
  const session = query.data.recording?.latest;
  const consentPending = session?.participants.filter((participant) => participant.decision !== "granted") ?? [];
  const canStart = Boolean(session?.status === "consent_pending" && consentPending.length === 0 && query.data.recording?.configured);
  const canPrepare = !session || ["declined", "cancelled", "failed", "ready", "deleted"].includes(session.status);
  const canStop = Boolean(session && ["starting", "recording", "stopping"].includes(session.status));
  return <section aria-label="Host waiting room controls" className="mt-3 space-y-3 rounded-xl border border-[#D5DAE2] p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Host waiting room</h3><span>Room: {query.data.roomState.replaceAll("_", " ")} · {query.data.guestLimit} admitted guest seats</span></div>
    <p className="text-[#667085]">Join as host before admitting a guest. Guest names come from invitations and do not prove CRM identity. Connection timestamps below are provider-reported.</p>
    {query.data.participants.length === 0 ? <p>No one has requested admission.</p> : <ul className="space-y-2">{query.data.participants.map((p) => <li key={p.id} className="rounded-lg border border-[#E6E8EC] p-2">
      <div className="font-semibold">{p.name} · {p.admission}</div>
      <p className="my-1 text-[#667085]">{!p.inviteValid ? "Invitation expired or revoked" : p.providerJoinedAt && (!p.providerLeftAt || p.providerLeftAt < p.providerJoinedAt) ? "Provider reported joined" : p.providerLeftAt ? "Provider reported left" : "No provider connection receipt"}</p>
      {p.role === "guest" && p.inviteValid && !ended ? <div className="flex flex-wrap gap-2">
        {p.admission !== "admitted" && p.admission !== "revoked" ? <><button type="button" className={button} disabled={command.isPending} onClick={() => command.mutate({ participantId: p.id, action: "admitted" })}>Admit</button><button type="button" className={button} disabled={command.isPending} onClick={() => command.mutate({ participantId: p.id, action: "denied" })}>Deny</button></> : null}
        {p.admission === "admitted" ? <><button type="button" className={button} disabled={command.isPending} onClick={() => command.mutate({ participantId: p.id, action: "mute" })}>Mute microphone</button><button type="button" className={button} disabled={command.isPending} onClick={() => command.mutate({ participantId: p.id, action: "remove" })}>Remove</button></> : null}
      </div> : null}
    </li>)}</ul>}

    <div className="space-y-2 rounded-lg border border-[#E6E8EC] bg-[#F8FAFC] p-3">
      <h4 className="font-bold">Meeting recording</h4>
      {!query.data.recording?.configured ? <p className="text-[#667085]">Not configured. This server needs LiveKit Egress and private S3 storage. No recording is running.</p> : null}
      {!query.data.recordingPolicy ? <p className="text-[#667085]">No regional recording policy is selected for this meeting. Choose a published policy when scheduling.</p> : null}
      {query.data.recordingPolicy ? <p className="whitespace-pre-wrap text-[#45505F]">{query.data.recordingPolicy.countryCode} · {query.data.recordingPolicy.purpose} · v{query.data.recordingPolicy.version}{query.data.recordingPolicy.retentionDays ? ` · ${query.data.recordingPolicy.retentionDays} day retention` : " · retention not set"}{"\n"}{query.data.recordingPolicy.notice ?? "This policy has no recording notice."}</p> : null}
      {session ? <>
        <p>State: <strong>{session.status.replaceAll("_", " ")}</strong> · selected policy {session.regionCode} · retention to {new Date(session.retentionExpiresAt).toLocaleString()}</p>
        <ul className="space-y-1">{session.participants.map((person, index) => <li key={`${person.participantId ?? person.displayName}-${index}`}>{person.displayName} ({person.role}) · consent {person.decision.replaceAll("_", " ")}</li>)}</ul>
        {session.status === "consent_pending" ? <button type="button" className={button} disabled={recording.isPending || !query.data.recording?.configured || !query.data.recordingPolicy?.allowed} onClick={() => recording.mutate("start")}>{recording.isPending ? "Starting…" : canStart ? "Start recording after consent" : "Waiting for participant consent"}</button> : null}
        {canStop ? <button type="button" className={`${button} text-[#B42318]`} disabled={recording.isPending} onClick={() => recording.mutate("stop")}>Stop recording</button> : null}
      </> : !ended && canPrepare && query.data.recording?.configured && query.data.recordingPolicy?.allowed ? <button type="button" className={button} disabled={recording.isPending || query.data.roomState !== "active"} onClick={() => recording.mutate("prepare")}>{recording.isPending ? "Preparing…" : "Review notice and request consent"}</button> : null}
      {artifacts.error ? <p role="alert" className="text-[#B42318]">Recording files could not be checked: {artifacts.error.message}</p> : null}
      {artifacts.data?.recordings.map((file) => <div key={file.id} className="rounded-md border border-[#E6E8EC] bg-white p-2">
        <p className="font-semibold">Artifact · {file.status.replaceAll("_", " ")}</p>
        <p className="text-[#667085]">{file.sizeBytes ? `${file.sizeBytes} bytes` : "Size not confirmed"} · expires {new Date(file.expiresAt).toLocaleDateString()}</p>
        {file.downloadUrl ? <a className="font-semibold text-[#137C48] underline" href={file.downloadUrl} target="_blank" rel="noreferrer">Download confirmed recording (link expires in 5 minutes)</a> : null}
        {file.failureMessage ? <p role="alert" className="text-[#B42318]">{file.failureMessage}</p> : null}
        <div className="mt-3 border-t border-[#E6E8EC] pt-2">
          <p className="font-semibold">Transcript and AI summary</p>
          {!file.aiProcessingAllowed ? <p className="text-[#667085]">Not available: the published policy did not authorize AI processing for this recording.</p> : null}
          {file.aiProcessingAllowed && !file.consents.length ? <p className="text-[#667085]">Not available: no participant consent evidence was recorded.</p> : null}
          {file.aiProcessingAllowed && file.consents.some((consent) => consent.decision !== "granted" || consent.revokedAt) ? <p className="text-[#B42318]">AI processing is blocked because at least one participant did not grant or later revoked consent.</p> : null}
          {file.aiProcessingAllowed && file.consents.length > 0 && file.consents.every((consent) => consent.decision === "granted" && !consent.revokedAt) ? <>
            <p className="text-[#667085]">Status: {file.artifactStatus.replaceAll("_", " ")}. AI confidence is not calibrated; a human must review the transcript and summary.</p>
            {file.artifactFailureMessage ? <p role="alert" className="text-[#B42318]">{file.artifactFailureMessage}</p> : null}
            {file.artifactStatus === "not_requested" || file.artifactStatus === "failed" ? <button type="button" className={`${button} mt-2`} disabled={meetingAi.isPending || file.status !== "ready"} onClick={() => meetingAi.mutate({ recordingId: file.id, action: "process" })}>{meetingAi.isPending ? "Requesting…" : "Request transcript and AI summary"}</button> : null}
            {file.transcriptText ? <details className="mt-2"><summary className="cursor-pointer font-semibold">Review transcript</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-[#F8FAFC] p-2 font-sans">{file.transcriptText}</pre></details> : null}
            {file.generatedSummary ? <div className="mt-2 rounded bg-[#F0FDF4] p-2"><p className="font-semibold">AI summary · confidence not calibrated</p><p className="whitespace-pre-wrap">{file.generatedSummary}</p></div> : null}
            {file.followUpDraft ? <div className="mt-2 rounded bg-[#F8FAFC] p-2"><p className="font-semibold">Suggested follow-up · not sent</p><p className="whitespace-pre-wrap">{file.followUpDraft}</p>
              {!file.customerLinked ? <p className="text-[#667085]">Link this meeting to a customer before saving an inbox draft.</p> : null}
              {file.customerLinked && !file.followUpDraftCreated ? <button type="button" className={`${button} mt-2`} disabled={meetingAi.isPending} onClick={() => meetingAi.mutate({ recordingId: file.id, action: "draft" })}>Save as unsent inbox draft</button> : null}
              {file.followUpDraftCreated ? <p className="mt-1 text-[#137C48]">Unsent inbox draft saved for review.</p> : null}
            </div> : null}
          </> : null}
        </div>
      </div>)}
      <p className="text-[#667085]">Recording controls require a provider receipt and verified private object before a download appears. Transcription and AI use are a separate, explicit, potentially billable action.</p>
    </div>

    {!ended ? <button type="button" className={`${button} text-[#B42318]`} disabled={command.isPending} onClick={() => command.mutate({ action: "end" })}>End for everyone</button> : null}
    <p className="text-[#667085]">{query.data.tokenNotice}</p>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
