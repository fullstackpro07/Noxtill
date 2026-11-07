"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Track as LiveTrack } from "livekit-client";
import type { VoiceMeetingJoinToken } from "@/lib/voice-meetings-api";
import { VoiceMeetingHostControls } from "./voice-meeting-host-controls";

function MediaTrack({ track }: { track: LiveTrack }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = track.attach();
    element.autoplay = true;
    if (element instanceof HTMLVideoElement) { element.playsInline = true; element.muted = true; }
    host.current?.appendChild(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [track]);

  if (track.kind === Track.Kind.Audio) return <div ref={host} aria-hidden="true" className="sr-only" />;
  return <figure className={`${track.source === Track.Source.ScreenShare ? "sm:col-span-2" : ""} overflow-hidden rounded-lg bg-[#111827]`}><div ref={host} className="min-h-24 [&_video]:max-h-[65vh] [&_video]:w-full [&_video]:object-contain" /><figcaption className="p-1 text-[11px] text-white">{track.source === Track.Source.ScreenShare ? "Shared screen" : "Camera"}</figcaption></figure>;
}

export function VoiceMeetingRoom({ access, onLeave }: { access: VoiceMeetingJoinToken; onLeave: () => void }) {
  const roomRef = useRef<Room | null>(null);
  const [tracks, setTracks] = useState<LiveTrack[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [error, setError] = useState("");
  const [screenSharing, setScreenSharing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [people, setPeople] = useState<Array<{ identity: string; name: string }>>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [quality, setQuality] = useState("Not reported");

  useEffect(() => {
    let active = true;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const syncTracks = () => {
      if (!active) return;
      const local = [...room.localParticipant.trackPublications.values()]
        .map((publication) => publication.track)
        .filter((track) => track !== undefined)
        .filter((track) => track.kind !== Track.Kind.Audio);
      const remote = [...room.remoteParticipants.values()].flatMap((participant) =>
        [...participant.trackPublications.values()]
          .map((publication) => publication.track)
          .filter((track) => track !== undefined),
      );
      setTracks([...local, ...remote]);
      setPeople([...room.remoteParticipants.values()].map((p) => ({ identity: p.identity, name: p.name || "Participant" })));
      setScreenSharing(room.localParticipant.isScreenShareEnabled);
      setCameraOn(room.localParticipant.isCameraEnabled);
      setMicrophoneOn(room.localParticipant.isMicrophoneEnabled);
    };
    const handleSubscribed = (track: LiveTrack) => {
      setTracks((current) => current.some((item) => item.sid === track.sid) ? current : [...current, track]);
    };
    const handleUnsubscribed = (track: LiveTrack) => {
      setTracks((current) => current.filter((item) => item.sid !== track.sid));
    };
    const handleDisconnected = () => { if (active) { setConnecting(false); setConnected(false); setReconnecting(false); setTracks([]); setPeople([]); } };

    room.on(RoomEvent.Connected, () => { if (active) { setConnected(true); setConnecting(false); } });
    room.on(RoomEvent.Reconnecting, () => { if (active) setReconnecting(true); });
    room.on(RoomEvent.Reconnected, () => { if (active) { setReconnecting(false); syncTracks(); } });
    room.on(RoomEvent.TrackSubscribed, handleSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleUnsubscribed);
    room.on(RoomEvent.LocalTrackPublished, syncTracks);
    room.on(RoomEvent.LocalTrackUnpublished, syncTracks);
    room.on(RoomEvent.TrackMuted, syncTracks);
    room.on(RoomEvent.TrackUnmuted, syncTracks);
    room.on(RoomEvent.ParticipantConnected, syncTracks);
    room.on(RoomEvent.ParticipantDisconnected, syncTracks);
    room.on(RoomEvent.ActiveSpeakersChanged, (participants) => { if (active) setSpeakers(participants.map((p) => p.name || "Participant")); });
    room.on(RoomEvent.ConnectionQualityChanged, (value, participant) => { if (active && participant.identity === room.localParticipant.identity) setQuality(value); });
    room.on(RoomEvent.Disconnected, handleDisconnected);
    void room.connect(access.url, access.token)
      .then(syncTracks)
      .catch((reason: unknown) => {
        if (active) { setConnecting(false); setError(reason instanceof Error ? reason.message : "Could not connect to the video room."); }
      });

    return () => {
      active = false;
      room.removeAllListeners();
      void room.disconnect();
      roomRef.current = null;
    };
  }, [access.token, access.url]);

  const toggleCamera = async () => {
    try {
      const enabled = !cameraOn;
      await roomRef.current?.localParticipant.setCameraEnabled(enabled);
      setCameraOn(roomRef.current?.localParticipant.isCameraEnabled ?? false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Camera permission was not granted.");
    }
  };

  const toggleMicrophone = async () => {
    try {
      const enabled = !microphoneOn;
      await roomRef.current?.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneOn(roomRef.current?.localParticipant.isMicrophoneEnabled ?? false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Microphone permission was not granted.");
    }
  };

  const toggleScreenShare = async () => {
    if (!access.screenShare || !connected || reconnecting) return;
    try {
      await roomRef.current?.localParticipant.setScreenShareEnabled(!screenSharing);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Screen sharing could not start."); }
  };
  const loadDevices = async () => {
    try { setDevices(await navigator.mediaDevices.enumerateDevices()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Devices could not be listed."); }
  };
  const selectDevice = async (kind: "audioinput" | "videoinput" | "audiooutput", id: string) => {
    try { await roomRef.current?.switchActiveDevice(kind, id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This device could not be selected."); }
  };

  return (
    <section className="mt-3 rounded-xl border border-[#D8E6DD] bg-[#F7FBF8] p-3" aria-label="Live video meeting">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold">{reconnecting ? "Reconnecting to the meeting…" : connected ? "Connected to live meeting" : error ? "Could not connect" : connecting ? "Connecting to the meeting…" : "Disconnected from the meeting"}</p>
        <button type="button" className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold" onClick={() => { void roomRef.current?.disconnect(); onLeave(); }}>Leave meeting</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[11px] text-[#B42318]">{error}</p> : null}
      {connected && access.role === "guest" && !people.some((p) => p.identity.startsWith("host:")) ? <p role="status" className="mt-2 text-xs text-[#92400E]">The host is disconnected. Existing guests can remain; new guest joins wait for the host to return.</p> : null}
      {connected ? <p className="mt-2 text-xs">Participants: you{people.length ? `, ${people.map((p) => p.name).join(", ")}` : " only"}. Names are meeting display names, not verified CRM identities.</p> : null}
      {connected ? <p className="mt-1 text-xs text-[#667085]">Your connection quality: {quality}. {speakers.length ? `Speaking: ${speakers.join(", ")}` : "No active speaker reported."}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {tracks.filter((track) => track.kind === Track.Kind.Video).map((track) => <MediaTrack key={track.sid} track={track} />)}
        {tracks.filter((track) => track.kind === Track.Kind.Audio).map((track) => <MediaTrack key={track.sid} track={track} />)}
      </div>
      {connected && tracks.length === 0 ? <p className="mt-3 text-[11px] text-[#697586]">You are in the room. Turn on your camera or microphone when ready.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!connected || reconnecting} className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50" onClick={() => void toggleCamera()}>{cameraOn ? "Turn camera off" : "Turn camera on"}</button>
        <button type="button" disabled={!connected || reconnecting} className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50" onClick={() => void toggleMicrophone()}>{microphoneOn ? "Mute microphone" : "Turn microphone on"}</button>
        {access.screenShare ? <button type="button" disabled={!connected || reconnecting} className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50" onClick={() => void toggleScreenShare()}>{screenSharing ? "Stop sharing screen" : "Share screen (host only)"}</button> : null}
        <button type="button" disabled={!connected} className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50" onClick={() => { void roomRef.current?.startAudio().catch(() => setError("Browser audio playback is blocked. Check browser permissions.")); }}>Enable meeting audio</button>
        <button type="button" disabled={!connected} className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50" onClick={() => void loadDevices()}>Choose devices</button>
      </div>
      {devices.length ? <div className="mt-3 flex flex-wrap gap-2">{(["audioinput", "videoinput", "audiooutput"] as const).map((kind) => <label key={kind} className="grid gap-1 text-xs">{kind === "audioinput" ? "Microphone" : kind === "videoinput" ? "Camera" : "Speaker"}<select className="rounded border border-[#D5DAE2] p-1" defaultValue="" onChange={(event) => { if (event.target.value) void selectDevice(kind, event.target.value); }}><option value="">Select a listed device</option>{devices.filter((d) => d.kind === kind && d.deviceId).map((d, index) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${kind} ${index + 1}`}</option>)}</select></label>)}</div> : null}
      {access.role === "host" ? <VoiceMeetingHostControls meetingId={access.meetingId} /> : null}
      <p className="mt-2 text-[10px] leading-5 text-[#697586]">Only the host can share a screen. Recording is controlled by the published policy, participant consent and host controls. Meeting chat is not available.</p>
    </section>
  );
}
