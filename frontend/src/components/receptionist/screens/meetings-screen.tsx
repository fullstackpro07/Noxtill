"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askText } from "@/lib/ask-dialog";
import { fetchAppointments } from "@/lib/bookings-api";
import {
  cancelVoiceMeeting,
  createVoiceMeeting,
  createVoiceMeetingInvite,
  fetchVoiceMeetingHosts,
  fetchVoiceMeetingConfiguration,
  fetchVoiceMeetingRecordingPolicies,
  fetchVoiceMeetings,
  rescheduleVoiceMeeting,
  revokeVoiceMeetingInvite,
  createVoiceMeetingHostJoinToken,
  type VoiceVideoMeeting,
  type VoiceMeetingJoinToken,
} from "@/lib/voice-meetings-api";
import { Card, CardHead, Chip, EmptyState, Footnote, PrimaryBtn, SmallBtn } from "../rx-ui";
import { useRx } from "../rx-data";
import { VoiceMeetingRoom } from "../voice-meeting-room";
import { VoiceMeetingHostControls } from "../voice-meeting-host-controls";

const inputClass = "h-[36px] w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] outline-none focus:border-[#16A34A]";
const errorText = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The request could not be completed.";
const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const currentTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
};
const formatMeetingTime = (value: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
};

export function VoiceMeetingsScreen() {
  const client = useQueryClient();
  const now = useRx().now;
  const timeZone = useMemo(() => currentTimeZone(), []);
  const createFormRef = useRef<HTMLFormElement>(null);
  const inviteFormRef = useRef<HTMLFormElement>(null);
  const rescheduleFormRef = useRef<HTMLFormElement>(null);
  const [notice, setNotice] = useState("");
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [joiningMeetingId, setJoiningMeetingId] = useState<string | null>(null);
  const [roomAccess, setRoomAccess] = useState<VoiceMeetingJoinToken | null>(null);
  const [hostControlsId, setHostControlsId] = useState<string | null>(null);
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    scheduledAt: localDateTime(new Date(now.getTime() + 60 * 60_000)),
    durationMin: "30",
    hostBusinessUserId: "",
    appointmentId: "",
    recordingPolicyVersionId: "",
  });
  const [rescheduleMeeting, setRescheduleMeeting] = useState<VoiceVideoMeeting | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ scheduledAt: "", durationMin: "30" });

  const meetings = useQuery({ queryKey: ["voice-meetings"], queryFn: fetchVoiceMeetings });
  const configuration = useQuery({ queryKey: ["voice-meeting-configuration"], queryFn: fetchVoiceMeetingConfiguration });
  const hosts = useQuery({ queryKey: ["voice-meeting-hosts"], queryFn: fetchVoiceMeetingHosts });
  const recordingPolicies = useQuery({ queryKey: ["voice-meeting-recording-policies"], queryFn: fetchVoiceMeetingRecordingPolicies });
  const appointmentRange = useMemo(() => ({
    from: now.toISOString(),
    to: new Date(now.getTime() + 180 * 24 * 60 * 60_000).toISOString(),
  }), [now]);
  const appointments = useQuery({
    queryKey: ["voice-meeting-booking-options", appointmentRange.from, appointmentRange.to],
    queryFn: () => fetchAppointments(appointmentRange),
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["voice-meetings"] }),
      client.invalidateQueries({ queryKey: ["voice-meeting-hosts"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () => createVoiceMeeting({
      title: meetingForm.title.trim(),
      scheduledAt: new Date(meetingForm.scheduledAt).toISOString(),
      durationMin: Number(meetingForm.durationMin),
      timeZone,
      hostBusinessUserId: meetingForm.hostBusinessUserId,
      appointmentId: meetingForm.appointmentId || null,
      recordingPolicyVersionId: meetingForm.recordingPolicyVersionId || null,
    }),
    onSuccess: async () => {
      setNotice(configuration.data?.mediaConfigured ? "Meeting scheduled. The assigned host can admit invited guests during its join window." : "Meeting scheduled. Live video is not configured on this server.");
      setMeetingForm((form) => ({ ...form, title: "", appointmentId: "", recordingPolicyVersionId: "" }));
      await refresh();
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelVoiceMeeting(id, reason),
    onSuccess: async () => { setNotice("Schedule canceled and new guest joins revoked. Existing room closure follows provider confirmation."); await refresh(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const reschedule = useMutation({
    mutationFn: () => {
      if (!rescheduleMeeting) throw new Error("Choose a meeting to reschedule.");
      return rescheduleVoiceMeeting(rescheduleMeeting.id, new Date(rescheduleForm.scheduledAt).toISOString(), Number(rescheduleForm.durationMin));
    },
    onSuccess: async () => { setNotice("Meeting time updated"); setRescheduleMeeting(null); await refresh(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const invite = useMutation({
    mutationFn: ({ meetingId, email, name }: { meetingId: string; email: string; name: string }) => createVoiceMeetingInvite(meetingId, email, name),
    onSuccess: async (result, variables) => {
      const link = `${window.location.origin}${result.sharePath}`;
      setCreatedLink(link);
      setInviteFor(null);
      setInviteEmail("");
      setInviteName("");
      const delivery =
        result.emailDelivery === "sent"
          ? `Invite emailed to ${variables.email}.`
          : result.emailDelivery === "failed"
            ? "The invite email could not be delivered. Copy the link and send it to the guest."
            : "Email delivery is not configured. Copy the link and send it to the guest.";
      setNotice(`Guest invite created. ${delivery}`);
      await refresh();
      if (result.emailDelivery === "sent") return;
      try {
        await navigator.clipboard.writeText(link);
        setNotice(`Guest invite created and link copied. ${delivery}`);
      } catch {
        // The link remains visible for manual copy when clipboard permission is unavailable.
      }
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const revoke = useMutation({
    mutationFn: ({ meetingId, inviteId, reason }: { meetingId: string; inviteId: string; reason: string }) => revokeVoiceMeetingInvite(meetingId, inviteId, reason),
    onSuccess: async () => { setNotice("Guest invite revoked"); await refresh(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const join = useMutation({
    mutationFn: createVoiceMeetingHostJoinToken,
    onSuccess: (access, meetingId) => { setJoiningMeetingId(meetingId); setRoomAccess(access); setNotice(""); },
    onError: (error) => setNotice(errorText(error)),
  });

  const hostOptions = hosts.data ?? [];
  const rows = meetings.data ?? [];
  const pending = meetings.isPending || hosts.isPending;
  const queryError = meetings.error ?? hosts.error;

  const startReschedule = (meeting: VoiceVideoMeeting) => {
    setRescheduleMeeting(meeting);
    setRescheduleForm({ scheduledAt: localDateTime(new Date(meeting.scheduledAt)), durationMin: String(meeting.durationMin) });
  };

  const cancelMeeting = async (meeting: VoiceVideoMeeting) => {
    const reason = await askText({
      title: "Cancel this meeting?",
      description: "Enter a reason. Active guest links will stop working.",
      placeholder: "Reason for cancellation",
      minLength: 8,
      confirmLabel: "Cancel meeting",
    });
    if (reason) cancel.mutate({ id: meeting.id, reason });
  };

  const revokeInvite = async (meeting: VoiceVideoMeeting, inviteId: string) => {
    const reason = await askText({
      title: "Revoke this guest link?",
      description: "The guest will no longer be able to open the invite.",
      placeholder: "Reason for revoking the invite",
      minLength: 8,
      confirmLabel: "Revoke link",
    });
    if (reason) revoke.mutate({ meetingId: meeting.id, inviteId, reason });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-[-.02em]">Video Meetings</h1>
          <p className="mt-1 max-w-[760px] text-[12px] leading-[1.6] text-[#5B6675]">Schedule meetings and email personal guest links. {configuration.isPending ? "Checking video configuration…" : configuration.error ? "Video configuration could not be checked." : configuration.data?.mediaConfigured ? `Guests wait for assigned-host admission. Only the host can share a screen. Recording ${configuration.data.recording === "configured" ? "requires a published regional policy and every attendee's consent" : "is not configured on the server"}. Meeting chat is not available.` : "Live video not configured. Set the LiveKit server URL and API credentials to enable rooms."}</p>
        </div>
        <Chip tone={configuration.data?.mediaConfigured ? "green" : "amber"} h={24} fontSize={11}>{configuration.isPending ? "Checking configuration" : configuration.error ? "Configuration unavailable" : configuration.data?.mediaConfigured ? "Live video configured" : "Live video not configured"}</Chip>
      </div>

      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1.05fr)_minmax(400px,.95fr)]">
        <Card overflow>
          <CardHead title="Schedule a meeting" sub="Uses a real booking when linked" />
          <form ref={createFormRef} className="grid gap-3 p-[18px]" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
            <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">Meeting title
              <input className={inputClass} required minLength={3} maxLength={200} value={meetingForm.title} onChange={(event) => setMeetingForm((form) => ({ ...form, title: event.target.value }))} placeholder="For example, booking consultation" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">Date and time ({timeZone})
                <input className={inputClass} type="datetime-local" required min={localDateTime(new Date(now))} value={meetingForm.scheduledAt} onChange={(event) => setMeetingForm((form) => ({ ...form, scheduledAt: event.target.value }))} />
              </label>
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">Duration
                <select className={inputClass} value={meetingForm.durationMin} onChange={(event) => setMeetingForm((form) => ({ ...form, durationMin: event.target.value }))}>
                  {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">Host
              <select className={inputClass} required value={meetingForm.hostBusinessUserId} onChange={(event) => setMeetingForm((form) => ({ ...form, hostBusinessUserId: event.target.value }))}>
                <option value="">Choose an active host</option>
                {hostOptions.map((host) => <option key={host.id} value={host.id}>{host.name} · {host.email}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">Link an existing booking (optional)
              <select className={inputClass} value={meetingForm.appointmentId} onChange={(event) => setMeetingForm((form) => ({ ...form, appointmentId: event.target.value }))}>
                <option value="">No booking linked</option>
                {(appointments.data ?? []).map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.customerName} · {appointment.serviceName} · {formatMeetingTime(appointment.startsAt, timeZone)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">Recording policy (optional)
              <select className={inputClass} value={meetingForm.recordingPolicyVersionId} onChange={(event) => setMeetingForm((form) => ({ ...form, recordingPolicyVersionId: event.target.value }))}>
                <option value="">Do not enable recording for this meeting</option>
                {(recordingPolicies.data ?? []).map((policy) => <option key={policy.id} value={policy.id}>{policy.countryCode} · {policy.purpose} · {policy.callerType} · v{policy.version} · {policy.retentionDays} day retention</option>)}
              </select>
              <span className="font-normal text-[color:var(--app-text-faintest,#667085)]">Use a published policy reviewed for this meeting. The selected country does not establish a guest&apos;s location or legal jurisdiction.</span>
              {recordingPolicies.error ? <span role="alert" className="font-normal text-[#B42318]">Published recording policies could not be loaded: {errorText(recordingPolicies.error)}</span> : null}
            </label>
            {appointments.isError ? <p className="text-[11px] text-[#B42318]">Bookings could not be loaded: {errorText(appointments.error)}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F3] pt-3">
              <p className="max-w-[490px] text-[11px] leading-[1.55] text-[color:var(--app-text-faintest,#667085)]">The time uses this device&apos;s time zone. Scheduling does not create a video room or send email.</p>
              <PrimaryBtn onClick={() => createFormRef.current?.requestSubmit()} disabled={create.isPending || hostOptions.length === 0}>
                {create.isPending ? "Scheduling…" : "Schedule meeting"}
              </PrimaryBtn>
            </div>
          </form>
        </Card>

        <Card overflow>
          <CardHead title="Upcoming and past meetings" sub={`${rows.length} records`} />
          <div className="p-[18px]">
            {pending ? <p className="text-[12px] text-[#697586]">Loading meetings…</p> : null}
            {queryError ? <p role="alert" className="rounded-[9px] border border-[#FBD5D2] bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]">{errorText(queryError)}</p> : null}
            {!pending && !queryError && rows.length === 0 ? <EmptyState icon="calendar" title="No meetings scheduled" body="Schedule a meeting here. It will not start a phone call or video room until a media provider is configured." /> : null}
            <div className="flex flex-col gap-3">
              {rows.map((meeting) => (
                <article key={meeting.id} className="rounded-[11px] border border-[#E6E8EC] bg-white p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="break-words text-[13px] font-extrabold">{meeting.title}</h2>
                      <p className="mt-1 text-[11px] text-[#697586]">{formatMeetingTime(meeting.scheduledAt, meeting.timeZone)} · {meeting.durationMin} min · Host {meeting.host.name}</p>
                      <p className="mt-1 text-[11px] text-[#697586]">
                        {meeting.appointment ? `Booking ${meeting.appointment.bookingNo ?? meeting.appointment.id} · ${meeting.customer?.name ?? "Customer linked"}` : "No booking linked"}
                      </p>
                    </div>
                    <Chip tone={meeting.status === "scheduled" ? "blue" : meeting.status === "cancelled" ? "red" : "neutral"}>{meeting.status === "cancelled" ? `Cancelled${meeting.roomState === "ending" ? " · media closure pending" : ""}` : meeting.roomState === "active" || meeting.roomState === "ending" ? meeting.roomState : meeting.status}</Chip>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {meeting.status === "scheduled" ? <>
                      {meeting.media === "configured" ? <SmallBtn disabled={join.isPending} onClick={() => join.mutate(meeting.id)}>{join.isPending && join.variables === meeting.id ? "Joining…" : "Join video"}</SmallBtn> : null}
                      <SmallBtn onClick={() => setHostControlsId(hostControlsId === meeting.id ? null : meeting.id)}>Host controls</SmallBtn>
                      <SmallBtn onClick={() => setInviteFor(inviteFor === meeting.id ? null : meeting.id)}>Invite guest</SmallBtn>
                      <SmallBtn onClick={() => startReschedule(meeting)}>Reschedule</SmallBtn>
                      <SmallBtn disabled={cancel.isPending} onClick={() => void cancelMeeting(meeting)}>Cancel</SmallBtn>
                    </> : null}
                    {meeting.media === "configured" ? <Chip tone="green">Video configured</Chip> : <Chip tone="amber">Video not configured</Chip>}
                    <Chip tone={meeting.recording === "ready" ? "green" : meeting.recording === "recording" ? "red" : "neutral"}>Recording · {meeting.recording.replaceAll("_", " ")}</Chip>
                    {meeting.recordingFinalizedAt ? <span className="self-center text-[10px] text-[#697586]">File confirmed · {meeting.recordingSizeBytes ?? "size unavailable"} bytes · expires {meeting.recordingExpiresAt ? formatMeetingTime(meeting.recordingExpiresAt, meeting.timeZone) : "not set"}</span> : null}
                  </div>

                  {joiningMeetingId === meeting.id && roomAccess ? <VoiceMeetingRoom access={roomAccess} onLeave={() => { setRoomAccess(null); setJoiningMeetingId(null); }} /> : null}
                  {hostControlsId === meeting.id && !(joiningMeetingId === meeting.id && roomAccess) ? <VoiceMeetingHostControls meetingId={meeting.id} /> : null}

                  {inviteFor === meeting.id ? (
                    <form ref={inviteFormRef} className="mt-3 grid gap-2 rounded-[9px] bg-[#F7F9FB] p-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); invite.mutate({ meetingId: meeting.id, email: inviteEmail.trim(), name: inviteName.trim() }); }}>
                      <input className={inputClass} type="email" required maxLength={191} value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Guest email" aria-label="Guest email" />
                      <input className={inputClass} maxLength={120} value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Guest name (optional)" aria-label="Guest name optional" />
                      <PrimaryBtn onClick={() => inviteFormRef.current?.requestSubmit()} disabled={invite.isPending}>{invite.isPending ? "Sending…" : "Send invite"}</PrimaryBtn>
                      <p className="text-[11px] leading-[1.5] text-[color:var(--app-text-faintest,#667085)] sm:col-span-3">The personal guest link is shown once and copied if permitted. Guests request admission during the join window and receive no room token until the host admits them. Only the host can screen share. If this meeting has a published recording policy, guests must read and accept its notice before joining a recording.</p>
                    </form>
                  ) : null}

                  {rescheduleMeeting?.id === meeting.id ? (
                    <form ref={rescheduleFormRef} className="mt-3 grid gap-2 rounded-[9px] bg-[#F7F9FB] p-3 sm:grid-cols-[1fr_130px_auto_auto]" onSubmit={(event) => { event.preventDefault(); reschedule.mutate(); }}>
                      <input className={inputClass} type="datetime-local" required min={localDateTime(new Date(now))} value={rescheduleForm.scheduledAt} onChange={(event) => setRescheduleForm((form) => ({ ...form, scheduledAt: event.target.value }))} aria-label="New meeting date and time" />
                      <select className={inputClass} value={rescheduleForm.durationMin} onChange={(event) => setRescheduleForm((form) => ({ ...form, durationMin: event.target.value }))} aria-label="New meeting duration">
                        {[15, 30, 45, 60, 90, 120, 180, 240].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                      </select>
                      <PrimaryBtn onClick={() => rescheduleFormRef.current?.requestSubmit()} disabled={reschedule.isPending}>{reschedule.isPending ? "Saving…" : "Save time"}</PrimaryBtn>
                      <SmallBtn onClick={() => setRescheduleMeeting(null)}>Close</SmallBtn>
                    </form>
                  ) : null}

                  {meeting.invites.length ? (
                    <div className="mt-3 border-t border-[#EEF0F3] pt-2.5">
                      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.07em] text-[color:var(--app-text-faintest,#667085)]">Guest links</p>
                      {meeting.invites.map((guest) => (
                        <div key={guest.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[11px]">
                          <span className="flex flex-wrap items-center gap-1.5">
                            {guest.guestName || guest.email} · expires {formatMeetingTime(guest.expiresAt, meeting.timeZone)}
                            {guest.emailSentAt ? <Chip tone="green" h={20} fontSize={10}>Emailed</Chip> : <Chip tone="neutral" h={20} fontSize={10}>Link shared manually</Chip>}
                          </span>
                          <SmallBtn onClick={() => void revokeInvite(meeting, guest.id)}>Revoke</SmallBtn>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
          <Footnote>Invite tokens are stored hashed. Room tokens expire within 60 seconds and are issued only to the active assigned host or an admitted invitation during the join window. Guests cannot screen share or moderate participants. Recording requires a published regional policy, every connected participant&apos;s consent, provider confirmation and a verified private file. Admission is not proof of a media connection.</Footnote>
        </Card>
      </div>

      {createdLink ? (
        <Card className="p-[15px]">
          <div className="text-[12px] font-extrabold">New guest link</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className={`${inputClass} min-w-[240px] flex-1`} readOnly value={createdLink} aria-label="New guest link" onFocus={(event) => event.currentTarget.select()} />
            <SmallBtn onClick={() => { void navigator.clipboard.writeText(createdLink).then(() => setNotice("Guest link copied"), () => setNotice("Select and copy the guest link manually")); }}>Copy</SmallBtn>
            <SmallBtn onClick={() => setCreatedLink("")}>Hide</SmallBtn>
          </div>
          <p className="mt-2 text-[11px] text-[#697586]">The invite token is only returned once. Save this link now; it cannot be retrieved after you hide it.</p>
        </Card>
      ) : null}

      {notice ? <p role="status" className="rounded-[9px] border border-[#D8E6DD] bg-white px-3 py-2.5 text-[12px] text-[#45505F]">{notice}</p> : null}
    </div>
  );
}
