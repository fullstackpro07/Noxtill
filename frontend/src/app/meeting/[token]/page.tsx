"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { createVoiceMeetingGuestJoinToken, fetchPublicVoiceMeetingInvite, fetchVoiceMeetingGuestLobby, recordGuestConsent, type VoiceMeetingJoinToken } from "@/lib/voice-meetings-api";
import { VoiceMeetingRoom } from "@/components/receptionist/voice-meeting-room";

export default function PublicVoiceMeetingInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const client = useQueryClient();
  const invite = useQuery({
    queryKey: ["public-voice-meeting-invite", token],
    queryFn: () => fetchPublicVoiceMeetingInvite(token),
    retry: false,
  });
  const [roomAccess, setRoomAccess] = useState<VoiceMeetingJoinToken | null>(null);
  const [requested, setRequested] = useState(false);
  const [joinNotice, setJoinNotice] = useState("");
  const [consentNotice, setConsentNotice] = useState("");
  const lobby = useQuery({ queryKey: ["public-voice-meeting-lobby", token], queryFn: () => fetchVoiceMeetingGuestLobby(token), enabled: requested || Boolean(roomAccess), refetchInterval: 3000, retry: false });
  const consent = useMutation({
    mutationFn: (accepted: boolean) => {
      const pending = lobby.data?.recordingConsent;
      if (!pending) throw new Error("There is no active recording consent request.");
      return recordGuestConsent(token, pending.recordingId, accepted);
    },
    onSuccess: async (result) => {
      setConsentNotice(result.accepted ? "Your consent was recorded. The host still must wait for every connected participant before starting." : "You declined recording. This recording session cannot proceed while this decision stands.");
      await client.invalidateQueries({ queryKey: ["public-voice-meeting-lobby", token] });
    },
    onError: (error) => setConsentNotice(error instanceof Error ? error.message : "Your recording decision could not be saved."),
  });
  const join = useMutation({ mutationFn: () => createVoiceMeetingGuestJoinToken(token), onSuccess: (result) => {
    setRequested(true);
    if ("token" in result) {
      client.setQueryData(["public-voice-meeting-lobby", token], { status: "admitted", message: "The host admitted your invitation." });
      setRoomAccess(result);
      setJoinNotice("");
    } else {
      setJoinNotice(result.message);
      void client.invalidateQueries({ queryKey: ["public-voice-meeting-lobby", token] });
    }
  } });

  if (invite.isError && invite.error instanceof ApiError && invite.error.status === 404) notFound();
  if (invite.isPending) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#F5F6F8] p-6"><p className="text-sm text-[#697586]">Loading meeting invite…</p></main>;
  }
  if (invite.isError || !invite.data) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#F5F6F8] p-6"><div className="max-w-md rounded-2xl border border-[#E6E8EC] bg-white p-6 text-center"><h1 className="text-lg font-bold">Invite could not be loaded</h1><p className="mt-2 text-sm text-[#697586]">This link may have expired or been revoked. Ask the organizer for a new invite.</p></div></main>;
  }

  const meeting = invite.data;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F5F6F8] p-6">
      <section className="w-full max-w-xl rounded-2xl border border-[#E6E8EC] bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-[#15803D]">Meeting invitation · {meeting.businessName}</p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{meeting.title}</h1>
        <p className="mt-3 text-sm text-[#45505F]">{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: meeting.timeZone }).format(new Date(meeting.scheduledAt))}</p>
        <p className="mt-1 text-sm text-[#697586]">{meeting.durationMin} minutes · {meeting.timeZone}</p>
        {meeting.mediaAvailable ? (
          <div className="mt-5 rounded-xl border border-[#D8E6DD] bg-[#F7FBF8] p-4">
            <h2 className="text-sm font-bold text-[#166534]">Join the live meeting</h2>
            <p className="mt-1 text-sm leading-6 text-[#45505F]">Request host admission first. Camera and microphone stay off until you turn them on. Guests cannot screen share. Recording requires a published notice and each connected participant’s consent. A guest display name is not verified CRM identity.</p>
            {lobby.data?.status === "admitted" && lobby.data.recordingConsent && ["required", "pending"].includes(lobby.data.recordingConsent.status) ? (
              <div className="mt-3 rounded-lg border border-[#E6E8EC] bg-white p-3">
                <h3 className="text-sm font-bold">Recording consent required</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#45505F]">{lobby.data.recordingConsent.notice}</p>
                <p className="mt-2 text-xs text-[#667085]">The notice is stored with your decision. Declining means this recording session cannot proceed; you may still leave the meeting at any time.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => consent.mutate(true)} disabled={consent.isPending} className="rounded-lg bg-[#15803D] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">I consent to recording</button>
                  <button type="button" onClick={() => consent.mutate(false)} disabled={consent.isPending} className="rounded-lg border border-[#D5DAE2] px-4 py-2 text-sm font-semibold disabled:opacity-60">Decline</button>
                </div>
              </div>
            ) : null}
            {lobby.data?.recordingConsent && !["required", "pending"].includes(lobby.data.recordingConsent.status) ? <p className="mt-2 text-sm text-[#45505F]">Recording consent: {lobby.data.recordingConsent.status.replaceAll("_", " ")}.</p> : null}
            {consentNotice ? <p role="status" className="mt-2 text-sm">{consentNotice}</p> : null}
            <button type="button" onClick={() => join.mutate()} disabled={join.isPending || Boolean(roomAccess) || Boolean(lobby.error)} className="mt-3 rounded-lg bg-[#15803D] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{join.isPending ? "Requesting room access…" : roomAccess ? "Room access issued" : lobby.data?.status === "admitted" ? "Join admitted meeting" : requested ? "Check admission again" : "Request to join"}</button>
            {lobby.data ? <p role="status" className="mt-2 text-sm">{lobby.data.message}</p> : null}
            {joinNotice ? <p className="mt-2 text-sm">{joinNotice}</p> : null}
            {lobby.error ? <p role="alert" className="mt-2 text-sm text-[#B42318]">Access is no longer available: {lobby.error.message}</p> : null}
            {join.isError ? <p role="alert" className="mt-2 text-sm text-[#B42318]">{join.error instanceof Error ? join.error.message : "Could not join the meeting."}</p> : null}
            {roomAccess && !lobby.error && lobby.data?.status === "admitted" ? <VoiceMeetingRoom access={roomAccess} onLeave={() => setRoomAccess(null)} /> : null}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-[#FDE49B] bg-[#FFFBEB] p-4">
            <h2 className="text-sm font-bold text-[#92400E]">Live video not configured</h2>
            <p className="mt-1 text-sm leading-6 text-[#7A4E11]">{meeting.message}</p>
          </div>
        )}
        <p className="mt-4 text-xs text-[#667085]">This link requests admission to this meeting only. Only the host can share a screen. Recording, when configured, starts only after every connected participant consents and the host starts it.</p>
      </section>
    </main>
  );
}
