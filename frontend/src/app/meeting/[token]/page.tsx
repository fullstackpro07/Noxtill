"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { createVoiceMeetingGuestJoinToken, fetchPublicVoiceMeetingInvite, type VoiceMeetingJoinToken } from "@/lib/voice-meetings-api";
import { VoiceMeetingRoom } from "@/components/receptionist/voice-meeting-room";

export default function PublicVoiceMeetingInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const invite = useQuery({
    queryKey: ["public-voice-meeting-invite", token],
    queryFn: () => fetchPublicVoiceMeetingInvite(token),
    retry: false,
  });
  const [roomAccess, setRoomAccess] = useState<VoiceMeetingJoinToken | null>(null);
  const join = useMutation({ mutationFn: () => createVoiceMeetingGuestJoinToken(token), onSuccess: setRoomAccess });

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
            <p className="mt-1 text-sm leading-6 text-[#45505F]">This personal invite can join during the meeting window. Camera and microphone stay off until you turn them on. Recording and screen sharing are disabled.</p>
            <button type="button" onClick={() => join.mutate()} disabled={join.isPending || Boolean(roomAccess)} className="mt-3 rounded-lg bg-[#15803D] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{join.isPending ? "Joining…" : roomAccess ? "Connected" : "Join meeting"}</button>
            {join.isError ? <p role="alert" className="mt-2 text-sm text-[#B42318]">{join.error instanceof Error ? join.error.message : "Could not join the meeting."}</p> : null}
            {roomAccess ? <VoiceMeetingRoom access={roomAccess} onLeave={() => setRoomAccess(null)} /> : null}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-[#FDE49B] bg-[#FFFBEB] p-4">
            <h2 className="text-sm font-bold text-[#92400E]">Live video not configured</h2>
            <p className="mt-1 text-sm leading-6 text-[#7A4E11]">{meeting.message}</p>
          </div>
        )}
        <p className="mt-4 text-xs text-[#7A8798]">The invite only authorizes this guest to join this meeting. Recording and screen sharing are disabled.</p>
      </section>
    </main>
  );
}
