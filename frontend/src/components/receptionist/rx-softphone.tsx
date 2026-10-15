"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Call, Device } from "@twilio/voice-sdk";
import { ApiError } from "@/lib/api-client";
import {
  endVoiceSoftphoneCall,
  fetchVoiceSoftphoneCall,
  fetchVoiceSoftphoneStatus,
  issueVoiceSoftphoneToken,
  setVoiceSoftphoneHold,
  type VoiceSoftphoneCall,
} from "@/lib/voice-calls-api";
import { Card, CardHead, Chip, SmallBtn } from "./rx-ui";

export function RxSoftphone() {
  const queryClient = useQueryClient();
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [callInfo, setCallInfo] = useState<VoiceSoftphoneCall | null>(null);
  const [deviceState, setDeviceState] = useState("Disconnected");
  const [callState, setCallState] = useState("No call");
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = useQuery({
    queryKey: ["voice-softphone-status"],
    queryFn: fetchVoiceSoftphoneStatus,
    staleTime: 30_000,
  });

  useEffect(() => () => deviceRef.current?.destroy(), []);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const { token } = await issueVoiceSoftphoneToken();
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, { logLevel: "error" });
      device.on("registered", () => setDeviceState("Ready"));
      device.on("unregistered", () => setDeviceState("Disconnected"));
      device.on("error", (event) => setError(event.message));
      device.on("incoming", (incoming) => {
        callRef.current = incoming;
        setCall(incoming);
        setCallInfo(null);
        setCallState("Ringing · answer in browser");
        setMuted(false);
        setHeld(false);
        const sid = incoming.parameters.CallSid;
        if (sid) {
          void fetchVoiceSoftphoneCall(sid)
            .then(setCallInfo)
            .catch((fetchError: unknown) => {
              setError(
                fetchError instanceof ApiError
                  ? fetchError.message
                  : "Call details are not available yet.",
              );
            });
        }
        incoming.on("accept", () => setCallState("Connected"));
        incoming.on("disconnect", () => {
          setCallState("Ended");
          setCall(null);
          setCallInfo(null);
          callRef.current = null;
          setHeld(false);
          setMuted(false);
          void queryClient.invalidateQueries({
            queryKey: ["voice-supervisor-live"],
          });
        });
        incoming.on("cancel", () => {
          setCallState("Caller ended the call");
          setCall(null);
          setCallInfo(null);
          callRef.current = null;
        });
        incoming.on("error", (callError: Error) => setError(callError.message));
      });
      deviceRef.current?.destroy();
      deviceRef.current = device;
      await device.register();
      setDeviceState("Connecting…");
    } catch (connectError) {
      setError(
        connectError instanceof ApiError
          ? connectError.message
          : connectError instanceof Error
            ? connectError.message
            : "The browser phone could not connect.",
      );
      setDeviceState("Disconnected");
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!call) return;
    try {
      await call.accept();
      setCallState("Connecting…");
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Could not answer this call.",
      );
    }
  };

  const toggleMute = () => {
    if (!call) return;
    const nextMuted = !muted;
    call.mute(nextMuted);
    setMuted(nextMuted);
  };

  const toggleHold = async () => {
    if (!callInfo) {
      setError(
        "The active call could not be matched to its provider record yet.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await setVoiceSoftphoneHold(callInfo.callId, !held);
      setHeld(result.held);
    } catch (holdError) {
      setError(
        holdError instanceof ApiError
          ? holdError.message
          : "Twilio did not confirm the hold change.",
      );
    } finally {
      setBusy(false);
    }
  };

  const hangUp = async () => {
    if (!callInfo) {
      call?.disconnect();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await endVoiceSoftphoneCall(callInfo.callId);
      call?.disconnect();
    } catch (endError) {
      setError(
        endError instanceof ApiError
          ? endError.message
          : "Twilio did not confirm ending the call.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card overflow>
      <CardHead
        icon="headset"
        iconColor="#16A34A"
        title="Browser softphone"
        right={
          <Chip tone={deviceState === "Ready" ? "green" : "neutral"}>
            {deviceState}
          </Chip>
        }
        sub="Incoming calls to your active voice-agent profile"
      />
      <div className="flex flex-wrap items-center gap-2 p-4">
        {!status.data?.configured ? (
          <div className="flex-1 rounded-[9px] border border-[#E6E8EC] bg-[#FAFBFC] px-3 py-2 text-[11.5px] text-[#667085]">
            {status.data?.message ??
              (status.isPending
                ? "Checking Twilio browser-voice setup…"
                : "Not configured. Twilio browser-voice keys and an active agent profile are required.")}
          </div>
        ) : null}
        {deviceState !== "Ready" ? (
          <SmallBtn
            icon="phone"
            disabled={!status.data?.configured || busy}
            onClick={() => void connect()}
          >
            {busy ? "Connecting…" : "Connect browser phone"}
          </SmallBtn>
        ) : null}
        {call ? (
          <div className="flex min-w-full flex-wrap items-center gap-2 border-t border-[#EEF0F3] pt-3">
            <Chip tone={callState.startsWith("Connected") ? "green" : "amber"}>
              {callState}
            </Chip>
            <span className="mr-auto text-[12px] font-semibold text-[#344054]">
              {callInfo?.caller ?? "Caller · identifying call…"}
            </span>
            {callState.startsWith("Ringing") ? (
              <SmallBtn icon="phone" onClick={() => void accept()}>
                Answer
              </SmallBtn>
            ) : (
              <>
                <SmallBtn icon={muted ? "mic-off" : "mic"} onClick={toggleMute}>
                  {muted ? "Unmute" : "Mute"}
                </SmallBtn>
                <SmallBtn
                  icon="pause"
                  disabled={!callInfo || busy}
                  onClick={() => void toggleHold()}
                >
                  {held ? "Resume" : "Hold"}
                </SmallBtn>
              </>
            )}
            <SmallBtn
              icon="phone-off"
              disabled={busy}
              onClick={() => void hangUp()}
            >
              Hang up
            </SmallBtn>
          </div>
        ) : callState !== "No call" ? (
          <div className="text-[11.5px] text-[#667085]">{callState}</div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="min-w-full rounded-[8px] border border-[#FBD5D2] bg-[#FEF3F2] px-3 py-2 text-[11px] text-[#B42318]"
          >
            {error}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
