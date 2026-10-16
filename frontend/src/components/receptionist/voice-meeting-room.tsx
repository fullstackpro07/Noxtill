"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Track as LiveTrack } from "livekit-client";
import type { VoiceMeetingJoinToken } from "@/lib/voice-meetings-api";

function MediaTrack({ track }: { track: LiveTrack }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = track.attach();
    element.autoplay = true;
    if (element instanceof HTMLVideoElement) element.playsInline = true;
    host.current?.appendChild(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [track]);

  return <div ref={host} className="min-h-24 overflow-hidden rounded-lg bg-[#111827] [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />;
}

export function VoiceMeetingRoom({ access, onLeave }: { access: VoiceMeetingJoinToken; onLeave: () => void }) {
  const roomRef = useRef<Room | null>(null);
  const [tracks, setTracks] = useState<LiveTrack[]>([]);
  const [connected, setConnected] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const syncTracks = () => {
      if (!active) return;
      const local = [...room.localParticipant.trackPublications.values()]
        .map((publication) => publication.track)
        .filter((track) => track !== undefined);
      const remote = [...room.remoteParticipants.values()].flatMap((participant) =>
        [...participant.trackPublications.values()]
          .map((publication) => publication.track)
          .filter((track) => track !== undefined),
      );
      setTracks([...local, ...remote]);
    };
    const handleSubscribed = (track: LiveTrack) => {
      setTracks((current) => current.some((item) => item.sid === track.sid) ? current : [...current, track]);
    };
    const handleUnsubscribed = (track: LiveTrack) => {
      setTracks((current) => current.filter((item) => item.sid !== track.sid));
    };
    const handleDisconnected = () => { if (active) setConnected(false); };

    room.on(RoomEvent.Connected, () => { if (active) setConnected(true); });
    room.on(RoomEvent.TrackSubscribed, handleSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleUnsubscribed);
    room.on(RoomEvent.LocalTrackPublished, syncTracks);
    room.on(RoomEvent.LocalTrackUnpublished, syncTracks);
    room.on(RoomEvent.ParticipantConnected, syncTracks);
    room.on(RoomEvent.ParticipantDisconnected, syncTracks);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    void room.connect(access.url, access.token)
      .then(syncTracks)
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not connect to the video room.");
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
      setCameraOn(enabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Camera permission was not granted.");
    }
  };

  const toggleMicrophone = async () => {
    try {
      const enabled = !microphoneOn;
      await roomRef.current?.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneOn(enabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Microphone permission was not granted.");
    }
  };

  return (
    <section className="mt-3 rounded-xl border border-[#D8E6DD] bg-[#F7FBF8] p-3" aria-label="Live video meeting">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold">{connected ? "Connected to live meeting" : error ? "Could not connect" : "Connecting to live meeting…"}</p>
        <button type="button" className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold" onClick={() => { void roomRef.current?.disconnect(); onLeave(); }}>Leave meeting</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-[11px] text-[#B42318]">{error}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {tracks.filter((track) => track.kind === Track.Kind.Video).map((track) => <MediaTrack key={track.sid} track={track} />)}
        {tracks.filter((track) => track.kind === Track.Kind.Audio).map((track) => <MediaTrack key={track.sid} track={track} />)}
      </div>
      {connected && tracks.length === 0 ? <p className="mt-3 text-[11px] text-[#697586]">You are in the room. Turn on your camera or microphone when ready.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold" onClick={() => void toggleCamera()}>{cameraOn ? "Turn camera off" : "Turn camera on"}</button>
        <button type="button" className="rounded-lg border border-[#D5DAE2] bg-white px-3 py-1.5 text-[11px] font-bold" onClick={() => void toggleMicrophone()}>{microphoneOn ? "Mute microphone" : "Turn microphone on"}</button>
      </div>
      <p className="mt-2 text-[10px] leading-5 text-[#697586]">Screen sharing and recording are disabled. No recording has started.</p>
    </section>
  );
}
