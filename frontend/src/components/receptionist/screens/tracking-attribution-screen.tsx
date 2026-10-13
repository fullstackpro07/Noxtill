"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  fetchVoiceTrackingOverview,
  overrideVoiceCallAttribution,
  type VoiceTrackingCharge,
  type VoiceTrackingOverview,
} from "@/lib/voice-tracking-api";
import { Ico } from "../rx-icon";
import {
  Card,
  CardHead,
  Chip,
  EmptyState,
  KpiCard,
  SmallBtn,
  TableWrap,
  Th,
  kpiGrid,
} from "../rx-ui";

const dateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

function chargeLabel(rows: VoiceTrackingCharge[]) {
  if (!rows.length) return "Not available";
  return rows
    .map((row) => `${row.amount} ${row.unit ?? "unit not recorded"}`)
    .join(" · ");
}

type TrackingCall = VoiceTrackingOverview["calls"][number];

function CallTable({
  data,
  selectedCallId,
  onCorrect,
}: {
  data: VoiceTrackingOverview;
  selectedCallId: string | null;
  onCorrect: (call: TrackingCall) => void;
}) {
  if (!data.calls.length) {
    return (
      <EmptyState
        icon="phone-call"
        title="No calls in this date window"
        body="The table fills from saved call records. No sample calls or campaign matches are added."
      />
    );
  }

  return (
    <TableWrap
      minWidth={900}
      head={
        <>
          <Th>Call</Th>
          <Th>Started</Th>
          <Th>Outcome</Th>
          <Th>Marketing source</Th>
          <Th>Booking link</Th>
          <Th align="right">Provider charge</Th>
          <Th>Action</Th>
        </>
      }
    >
      {data.calls.map((call) => (
        <tr key={call.id} className="border-b border-[#EEF0F3] last:border-0">
          <td className="px-3 py-3">
            <div className="text-[12px] font-bold">{call.caller}</div>
            <div className="mt-1 text-[10.5px] capitalize text-[#94A3B8]">
              {call.status.replaceAll("_", " ")}
            </div>
          </td>
          <td className="px-3 py-3 text-[11.5px] text-[#45505F]">
            {dateTime(call.startedAt)}
          </td>
          <td className="px-3 py-3">
            <div className="text-[11.5px] capitalize text-[#45505F]">
              {call.outcome.replaceAll("_", " ")}
            </div>
            {call.routingRule ? (
              <div className="mt-1 text-[10.5px] text-[#94A3B8]">
                Routed by {call.routingRule}
              </div>
            ) : null}
          </td>
          <td className="px-3 py-3">
            {call.marketingAttribution ? (
              <>
                <div className="text-[11.5px] font-bold text-[#344054]">
                  {call.marketingAttribution.source} · {call.marketingAttribution.channel}
                </div>
                {call.marketingAttribution.campaignLabel ? (
                  <div className="mt-1 text-[10.5px] text-[#667085]">
                    {call.marketingAttribution.campaignLabel}
                  </div>
                ) : null}
                <Chip tone="blue" className="mt-1">Manual · evidence entered</Chip>
                <details className="mt-1 max-w-[240px] text-[10.5px] text-[#667085]">
                  <summary className="cursor-pointer font-semibold">Evidence &amp; reason</summary>
                  <p className="mb-1 mt-1 whitespace-pre-wrap">{call.marketingAttribution.evidence}</p>
                  <p className="mb-0 whitespace-pre-wrap">{call.marketingAttribution.reason}</p>
                </details>
              </>
            ) : (
              <Chip tone="neutral">Unknown · not assigned</Chip>
            )}
          </td>
          <td className="px-3 py-3 text-[11.5px] text-[#45505F]">
            {call.booking
              ? `Booking${call.booking.bookingNo ? ` #${call.booking.bookingNo}` : ""} · ${call.booking.status.replaceAll("_", " ")}`
              : "No linked booking"}
          </td>
          <td className="px-3 py-3 text-right text-[11.5px] tabular-nums text-[#45505F]">
            {call.providerCharge
              ? `${call.providerCharge.amount} ${call.providerCharge.unit ?? "unit not recorded"}`
              : "Not priced"}
          </td>
          <td className="px-3 py-3">
            <SmallBtn onClick={() => onCorrect(call)}>
              {selectedCallId === call.id ? "Editing" : call.marketingAttribution ? "Correct" : "Add evidence"}
            </SmallBtn>
          </td>
        </tr>
      ))}
    </TableWrap>
  );
}

export function TrackingAttributionScreen() {
  const [days, setDays] = useState(30);
  const [selectedCall, setSelectedCall] = useState<TrackingCall | null>(null);
  const [source, setSource] = useState("");
  const [channel, setChannel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["voice-tracking-overview", days],
    queryFn: () => fetchVoiceTrackingOverview(days),
  });
  const correction = useMutation({
    mutationFn: (input: { callId: string; source: string; channel: string; campaignId?: string; evidence: string; reason: string }) =>
      overrideVoiceCallAttribution(input.callId, {
        source: input.source,
        channel: input.channel,
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        evidence: input.evidence,
        reason: input.reason,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["voice-tracking-overview"] });
      setSelectedCall(null);
      setSource("");
      setChannel("");
      setCampaignId("");
      setEvidence("");
      setReason("");
    },
  });

  const chooseCall = (call: TrackingCall) => {
    setSelectedCall(call);
    setSource(call.marketingAttribution?.source ?? "");
    setChannel(call.marketingAttribution?.channel ?? "");
    setCampaignId(call.marketingAttribution?.campaignId ?? "");
    setEvidence(call.marketingAttribution?.evidence ?? "");
    setReason("");
    correction.reset();
  };

  if (query.isPending) {
    return (
      <div className="animate-pulse rounded-[13px] border border-[#E6E8EC] bg-white p-6 text-[13px] text-[#7A8798]">
        Loading call tracking evidence…
      </div>
    );
  }
  if (query.isError) {
    const forbidden =
      query.error instanceof ApiError && query.error.status === 403;
    return (
      <Card pad={20}>
        <div className="flex items-start gap-3">
          <Ico
            name={forbidden ? "lock-keyhole" : "triangle-alert"}
            size={18}
            className={forbidden ? "text-[#B45309]" : "text-[#B42318]"}
          />
          <div>
            <div className="text-[14px] font-extrabold">
              {forbidden
                ? "Tracking access is restricted"
                : "Tracking data could not load"}
            </div>
            <div className="mt-1 text-[12px] text-[#667085]">
              {forbidden
                ? "Ask the business owner to grant voice management access."
                : query.error.message}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const data = query.data;
  const charges = chargeLabel(data.metrics.providerCharges);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[18px] font-extrabold tracking-[-.02em] text-[#0F172A]">
              Tracking &amp; Attribution
            </h1>
            <Chip tone="blue">Evidence only</Chip>
          </div>
          <p className="mb-0 mt-1 text-[12px] text-[#667085]">
            Calls, phone-linked bookings and provider-priced charges from saved
            records. No guessed campaign ROI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="tracking-window"
            className="text-[11.5px] font-bold text-[#667085]"
          >
            Date window
          </label>
          <select
            id="tracking-window"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-semibold text-[#344054]"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <SmallBtn icon="refresh-cw" onClick={() => void query.refetch()}>
            Refresh
          </SmallBtn>
        </div>
      </div>

      <div style={kpiGrid(155)}>
        <KpiCard
          label="Inbound calls"
          value={String(data.metrics.inboundCalls)}
          sub={`Saved calls · ${days} days`}
        />
        <KpiCard
          label="Call-linked bookings"
          value={String(data.metrics.callLinkedBookings)}
          sub="Direct PhoneCall → Appointment link"
          tone="green"
        />
        <KpiCard
          label="Completed call bookings"
          value={String(data.metrics.completedCallBookings)}
          sub="Canonical appointment status"
        />
        <KpiCard
          label="Provider-priced charges"
          value={charges}
          sub={data.limitations.providerCharges}
        />
        <KpiCard
          label="Manual source corrections"
          value={String(data.metrics.manualAttributedCalls)}
          sub={`Evidence entered · ${days} days · not provider-verified`}
        />
        <KpiCard
          label="Call-to-order revenue"
          value="Not available"
          sub="No call-to-order link"
        />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[minmax(260px,.82fr)_minmax(0,1.6fr)]">
        <Card overflow>
          <CardHead
            icon="phone"
            iconColor="#15803D"
            title="Business voice line"
          />
          <div className="p-[18px]">
            {data.line ? (
              <>
                <div className="text-[18px] font-extrabold tracking-[-.02em] text-[#101828]">
                  {data.line.phoneNumber}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip tone="green">{data.line.provider}</Chip>
                  <Chip tone="neutral">Shared business line</Chip>
                </div>
                <div className="mt-3 text-[11.5px] text-[#667085]">
                  Provisioned {dateTime(data.line.provisionedAt)}. This line is
                  not assigned to a specific marketing campaign.
                </div>
              </>
            ) : (
              <div className="text-[12px] text-[#667085]">
                No Twilio voice line is provisioned for this business.
              </div>
            )}
            <Link
              href="/receptionist/numbers"
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#15803D] no-underline"
            >
              <Ico name="external-link" size={13} />
              Manage voice number
            </Link>
            <div className="mt-4 rounded-[9px] border border-[#E6E8EC] bg-[#FAFBFC] p-3 text-[11px] leading-5 text-[#667085]">
              {data.limitations.trackingNumbers}
            </div>
          </div>
        </Card>

        <Card overflow>
          <CardHead
            icon="git-branch"
            iconColor="#6D28D9"
            title="Conversion evidence"
            sub={`Phone calls started since ${dateTime(data.since)}`}
          />
          <div className="grid gap-3 p-[18px] sm:grid-cols-3">
            <FunnelStep
              label="Saved calls"
              value={data.metrics.inboundCalls}
              detail="PhoneCall records"
            />
            <FunnelStep
              label="Linked bookings"
              value={data.metrics.callLinkedBookings}
              detail="Direct booking relation"
            />
            <FunnelStep
              label="Completed bookings"
              value={data.metrics.completedCallBookings}
              detail="Completed appointment status"
            />
          </div>
          <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-[18px] py-3 text-[11px] leading-5 text-[#667085]">
            These are operational links, not marketing attribution.{" "}
            {data.limitations.campaignRevenue}
          </div>
        </Card>
      </div>

      <Card overflow>
        <CardHead
          icon="list"
          iconColor="#45505F"
          title="Call evidence"
          sub={`${data.calls.length} most recent records · caller IDs masked`}
        />
        {selectedCall ? (
          <div className="border-b border-[#EEF0F3] bg-[#FCFCFD] p-[18px]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-extrabold text-[#101828]">Manual attribution correction</div>
                <div className="mt-1 text-[11px] text-[#667085]">Call {selectedCall.caller} · {dateTime(selectedCall.startedAt)}. Enter the source only when you have evidence; this will not be presented as provider-verified.</div>
              </div>
              <SmallBtn onClick={() => setSelectedCall(null)}>Cancel</SmallBtn>
            </div>
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedCall) return;
                correction.mutate({
                  callId: selectedCall.id,
                  source,
                  channel,
                  campaignId: campaignId || undefined,
                  evidence,
                  reason,
                });
              }}
            >
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                Source
                <input required minLength={2} maxLength={120} value={source} onChange={(event) => setSource(event.target.value)} placeholder="e.g. Google Ads" className="h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-normal text-[#344054]" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467]">
                Channel
                <input required minLength={2} maxLength={120} value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="e.g. Paid search" className="h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-normal text-[#344054]" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467] md:col-span-2">
                Existing advertising campaign (optional)
                <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-normal text-[#344054]">
                  <option value="">No campaign linked</option>
                  {data.campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.provider} · {campaign.goal} · {campaign.status}
                    </option>
                  ))}
                </select>
                {!data.campaignOptions.length ? <span className="font-normal text-[#98A2B3]">No advertising campaigns exist in this business yet.</span> : null}
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467] md:col-span-2">
                Evidence
                <textarea required minLength={8} maxLength={4000} rows={3} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Record what supports the source, such as a caller-confirmed campaign or consented landing-page evidence." className="rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 py-2 text-[12px] font-normal text-[#344054]" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#475467] md:col-span-2">
                Reason for correction
                <textarea required minLength={8} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this source is being added or corrected." className="rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 py-2 text-[12px] font-normal text-[#344054]" />
              </label>
              {correction.isError ? <div role="alert" className="text-[12px] text-[#B42318] md:col-span-2">{correction.error instanceof ApiError ? correction.error.message : "Attribution could not be saved."}</div> : null}
              <div className="flex items-center gap-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={correction.isPending}
                  className="flex h-8 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {correction.isPending ? "Saving…" : "Save correction"}
                </button>
                <span className="text-[10.5px] text-[#667085]">Before/after values, evidence and reason are recorded in the audit log.</span>
              </div>
            </form>
          </div>
        ) : null}
        <CallTable data={data} selectedCallId={selectedCall?.id ?? null} onCorrect={chooseCall} />
        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-[18px] py-3 text-[11px] leading-5 text-[#667085]">
          {data.limitations.marketingAttribution} {data.limitations.leads}
        </div>
      </Card>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-[10px] border border-[#E6E8EC] bg-white p-3.5">
      <div className="text-[11px] font-bold text-[#667085]">{label}</div>
      <div className="mt-1.5 text-[20px] font-extrabold tabular-nums text-[#101828]">
        {value}
      </div>
      <div className="mt-1 text-[10.5px] text-[#98A2B3]">{detail}</div>
    </div>
  );
}
