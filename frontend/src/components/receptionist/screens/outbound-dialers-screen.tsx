"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  createOutboundCampaign,
  fetchOutboundAgents,
  fetchOutboundAudience,
  fetchOutboundCampaigns,
  previewOutboundCampaign,
  updateOutboundCampaign,
  type OutboundCallerType,
  type OutboundCampaign,
  type OutboundCampaignInput,
  type OutboundEligibilityPreview,
  type OutboundPurpose,
} from "@/lib/voice-outbound-api";
import { Card, CardHead, Chip, EmptyState, SmallBtn } from "../rx-ui";
import { OutboundCampaignRun } from "./outbound-campaign-run";
import { CampaignImport } from "../rx-campaign-import";

const fieldClass =
  "h-[36px] w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] outline-none focus:border-[#16A34A]";
const textareaClass =
  "w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 py-2 text-[12px] leading-[1.55] outline-none focus:border-[#16A34A]";
const toError = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "The request could not be completed.";
const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const readableReason = (value: string) => value.replaceAll("_", " ");

export function OutboundDialersScreen() {
  const client = useQueryClient();
  const timeZone = useMemo(() => deviceTimeZone(), []);
  const campaigns = useQuery({
    queryKey: ["voice-outbound-campaigns"],
    queryFn: fetchOutboundCampaigns,
  });
  const audience = useQuery({
    queryKey: ["voice-outbound-audience"],
    queryFn: fetchOutboundAudience,
  });
  const agents = useQuery({
    queryKey: ["voice-outbound-agents"],
    queryFn: fetchOutboundAgents,
  });
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<OutboundEligibilityPreview | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    purpose: "callback" as OutboundPurpose,
    callerType: "live_agent" as OutboundCallerType,
    countryCode: "",
    timeZone,
    openingScript: "",
    aiAgentId: "",
    humanAgentProfileId: "",
    scheduledAt: "",
    maxAttemptsPerContact: "1",
    retryCooldownHours: "24",
    voicemailDetection: false,
  });

  const selectedCampaign =
    (campaigns.data ?? []).find((item) => item.id === selectedCampaignId) ??
    null;
  const saveMutation = useMutation({
    mutationFn: (input: OutboundCampaignInput) =>
      selectedCampaignId
        ? updateOutboundCampaign(selectedCampaignId, input)
        : createOutboundCampaign(input),
    onSuccess: async (saved) => {
      setSelectedCampaignId(saved.id);
      setNotice({
        text: selectedCampaignId
          ? "Draft changes saved. Run a fresh preview before relying on eligibility."
          : "Campaign draft created.",
      });
      setPreview(null);
      await client.invalidateQueries({
        queryKey: ["voice-outbound-campaigns"],
      });
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });
  const previewMutation = useMutation({
    mutationFn: (id: string) => previewOutboundCampaign(id),
    onSuccess: async (result) => {
      setPreview(result);
      setNotice({ text: result.message });
      await client.invalidateQueries({
        queryKey: ["voice-outbound-campaigns"],
      });
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });

  const toggleCustomer = (customerId: string) => {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
  };

  const loadCampaign = (campaign: OutboundCampaign) => {
    setSelectedCampaignId(campaign.id);
    setSelectedCustomerIds(campaign.members.map((member) => member.customerId));
    setForm({
      name: campaign.name,
      purpose: campaign.purpose,
      callerType: campaign.callerType,
      countryCode: campaign.countryCode,
      timeZone: campaign.timeZone,
      openingScript: campaign.openingScript,
      aiAgentId: campaign.aiAgentId ?? "",
      humanAgentProfileId: campaign.humanAgentProfileId ?? "",
      scheduledAt: campaign.scheduledAt
        ? new Date(campaign.scheduledAt).toISOString().slice(0, 16)
        : "",
      maxAttemptsPerContact: String(campaign.maxAttemptsPerContact),
      retryCooldownHours: String(campaign.retryCooldownHours),
      voicemailDetection: campaign.voicemailDetection,
    });
    setPreview(null);
    setNotice(null);
  };

  const newDraft = () => {
    setSelectedCampaignId(null);
    setSelectedCustomerIds([]);
    setForm({
      name: "",
      purpose: "callback",
      callerType: "live_agent",
      countryCode: "",
      timeZone,
      openingScript: "",
      aiAgentId: "",
      humanAgentProfileId: "",
      scheduledAt: "",
      maxAttemptsPerContact: "1",
      retryCooldownHours: "24",
      voicemailDetection: false,
    });
    setPreview(null);
    setNotice(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: OutboundCampaignInput = {
      name: form.name.trim(),
      purpose: form.purpose,
      callerType: form.callerType,
      countryCode: form.countryCode.trim().toUpperCase(),
      timeZone: form.timeZone.trim(),
      openingScript: form.openingScript.trim(),
      aiAgentId: form.callerType === "ai_voice" ? form.aiAgentId : null,
      humanAgentProfileId:
        form.callerType === "live_agent" ? form.humanAgentProfileId : null,
      scheduledAt: form.scheduledAt
        ? new Date(form.scheduledAt).toISOString()
        : null,
      maxAttemptsPerContact: Number(form.maxAttemptsPerContact),
      retryCooldownHours: Number(form.retryCooldownHours),
      voicemailDetection: form.voicemailDetection,
      customerIds: selectedCustomerIds,
    };
    saveMutation.mutate(input);
  };

  const isBusy = campaigns.isPending || audience.isPending || agents.isPending;
  const loadError = campaigns.error ?? audience.error ?? agents.error;
  const activeAgentExists =
    form.callerType === "ai_voice"
      ? (agents.data?.aiAgents.length ?? 0) > 0
      : (agents.data?.humanAgents.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-[-.02em]">
            Outbound Dialers
          </h1>
          <p className="mt-1 max-w-[790px] text-[12px] leading-[1.6] text-[#697586]">
            Prepare a callback or service campaign, check each selected customer
            against this business&apos;s saved consent, policy, opt-out and
            suppression evidence, then start approved AI calls one at a time or
            let the assigned human agent work the list with the power dialer.
            Eligibility is re-checked right before every call.
          </p>
        </div>
        <Chip tone="amber" h={24} fontSize={11}>
          Human dialer · approved AI campaigns
        </Chip>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="rounded-[9px] border border-[#FBD5D2] bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]"
        >
          {toError(loadError)}
        </p>
      ) : null}
      {notice ? (
        <p
          role={notice.error ? "alert" : "status"}
          className={`rounded-[9px] border p-3 text-[12px] ${notice.error ? "border-[#FBD5D2] bg-[#FEF3F2] text-[#B42318]" : "border-[#D5E8DA] bg-[#F0FDF4] text-[#166534]"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1.1fr)_minmax(350px,.9fr)]">
        <Card overflow>
          <CardHead
            title={
              selectedCampaign ? "Edit campaign draft" : "Create campaign draft"
            }
            sub="Real CRM customers · saving a draft places no calls"
          />
          <form className="grid gap-3 p-[18px]" onSubmit={submit}>
            <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
              Campaign name
              <input
                className={fieldClass}
                required
                minLength={3}
                maxLength={191}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="For example, requested callbacks"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Purpose
                <select
                  className={fieldClass}
                  value={form.purpose}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      purpose: event.target.value as OutboundPurpose,
                    }))
                  }
                >
                  <option value="callback">Requested callback</option>
                  <option value="service">Service follow-up</option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Caller type
                <select
                  className={fieldClass}
                  value={form.callerType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      callerType: event.target.value as OutboundCallerType,
                      aiAgentId: "",
                      humanAgentProfileId: "",
                    }))
                  }
                >
                  <option value="live_agent">Human agent</option>
                  <option value="ai_voice">AI voice agent</option>
                </select>
              </label>
            </div>
            {form.callerType === "ai_voice" ? (
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Published AI agent
                <select
                  className={fieldClass}
                  required
                  value={form.aiAgentId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      aiAgentId: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose an active published agent</option>
                  {(agents.data?.aiAgents ?? []).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Human agent
                <select
                  className={fieldClass}
                  required
                  value={form.humanAgentProfileId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      humanAgentProfileId: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose an active human profile</option>
                  {(agents.data?.humanAgents ?? []).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.presenceStatus}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Destination country (ISO 2-letter code)
                <input
                  className={fieldClass}
                  required
                  maxLength={2}
                  minLength={2}
                  pattern="[A-Za-z]{2}"
                  value={form.countryCode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      countryCode: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="US"
                />
              </label>
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Calling time zone
                <input
                  className={fieldClass}
                  required
                  maxLength={100}
                  value={form.timeZone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      timeZone: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
              Opening script
              <textarea
                className={textareaClass}
                required
                minLength={8}
                maxLength={4000}
                rows={3}
                value={form.openingScript}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    openingScript: event.target.value,
                  }))
                }
                placeholder="Enter the opening words for this campaign"
              />
              <span className="font-normal text-[#7A8798]">
                No text is generated automatically. Recording disclosures still
                follow the published country policy.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Scheduled start (after approval)
                <input
                  className={fieldClass}
                  type="datetime-local"
                  min={new Date().toISOString().slice(0, 16)}
                  value={form.scheduledAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduledAt: event.target.value,
                    }))
                  }
                />
                <span className="font-normal text-[#7A8798]">
                  An approved campaign starts automatically at this time; leave empty to start it manually.
                </span>
              </label>
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Max attempts
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={5}
                  required
                  value={form.maxAttemptsPerContact}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxAttemptsPerContact: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-[11px] font-bold text-[#5B6675]">
                Retry cooldown (hours)
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={168}
                  required
                  value={form.retryCooldownHours}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      retryCooldownHours: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="flex items-start gap-2 text-[11px] font-semibold text-[#334155]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.voicemailDetection}
                onChange={(event) =>
                  setForm((current) => ({ ...current, voicemailDetection: event.target.checked }))
                }
              />
              <span>
                Detect voicemail: when the provider reports an answering machine, the try is logged as voicemail and the contact is retried later.
              </span>
            </label>

            {selectedCampaign?.status === "draft" ? <CampaignImport campaignId={selectedCampaign.id} /> : null}

            <section className="rounded-[10px] border border-[#E6E8EC]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF0F3] px-3 py-2.5">
                <div>
                  <h2 className="text-[12px] font-extrabold">
                    Select CRM customers
                  </h2>
                  <p className="mt-0.5 text-[10px] text-[#7A8798]">
                    First 200 active CRM customers with saved phones; numbers
                    are masked. Campaigns reference CRM rows rather than copying
                    contact data.
                  </p>
                </div>
                <Chip tone="neutral">
                  {selectedCustomerIds.length} selected
                </Chip>
              </div>
              <div className="max-h-[220px] overflow-y-auto p-2">
                {audience.isPending ? (
                  <p className="p-2 text-[11px] text-[#7A8798]">
                    Loading CRM audience…
                  </p>
                ) : null}
                {!audience.isPending && !(audience.data ?? []).length ? (
                  <p className="p-2 text-[11px] text-[#7A8798]">
                    No active CRM customers with phone numbers are available.
                  </p>
                ) : null}
                {(audience.data ?? []).map((customer) => (
                  <label
                    key={customer.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2 py-2 text-[11px] hover:bg-[#F7F9FB]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() => toggleCustomer(customer.id)}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold text-[#334155]">
                      {customer.name}
                      <span className="ml-2 font-normal text-[#7A8798]">
                        {customer.phone}
                      </span>
                    </span>
                    {customer.optedOut ? (
                      <Chip tone="red" h={20} fontSize={10}>
                        Opted out
                      </Chip>
                    ) : form.purpose === "marketing" &&
                      !customer.consentMarketing ? (
                      <Chip tone="red" h={20} fontSize={10}>
                        Marketing consent missing
                      </Chip>
                    ) : null}
                  </label>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap justify-between gap-2 border-t border-[#EEF0F3] pt-3">
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={
                    saveMutation.isPending ||
                    isBusy ||
                    selectedCustomerIds.length === 0 ||
                    !activeAgentExists
                  }
                  className="flex h-[32px] flex-none items-center gap-1.5 whitespace-nowrap rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveMutation.isPending
                    ? "Saving…"
                    : selectedCampaign
                      ? "Save draft"
                      : "Create draft"}
                </button>
                {selectedCampaign ? (
                  <SmallBtn
                    disabled={
                      previewMutation.isPending ||
                      selectedCampaign.members.length === 0
                    }
                    onClick={() => previewMutation.mutate(selectedCampaign.id)}
                  >
                    {previewMutation.isPending
                      ? "Checking…"
                      : "Preview eligibility"}
                  </SmallBtn>
                ) : null}
              </div>
              {selectedCampaign ? (
                <button
                  type="button"
                  onClick={newDraft}
                  className="rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[11px] font-bold text-[#475569]"
                >
                  New draft
                </button>
              ) : null}
            </div>
            {!activeAgentExists ? (
              <p className="text-[11px] text-[#9A6700]">
                No active{" "}
                {form.callerType === "ai_voice"
                  ? "published AI agent"
                  : "human agent profile"}{" "}
                is available. Configure one in Agents & Availability before
                saving this draft.
              </p>
            ) : null}
          </form>
        </Card>

        <div className="flex flex-col gap-[18px]">
          <Card overflow>
            <CardHead
              title="Campaign drafts"
              sub={`${campaigns.data?.length ?? 0} saved records`}
            />
            <div className="flex flex-col gap-2.5 p-3.5">
              {campaigns.isPending ? (
                <p className="text-[11px] text-[#7A8798]">
                  Loading campaign drafts…
                </p>
              ) : null}
              {!campaigns.isPending && !(campaigns.data ?? []).length ? (
                <EmptyState
                  icon="phone-outgoing"
                  title="No campaign drafts"
                  body="Create a draft to check a real CRM audience against its saved eligibility evidence."
                />
              ) : null}
              {(campaigns.data ?? []).map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => loadCampaign(campaign)}
                  className={`w-full rounded-[10px] border p-3 text-left transition-colors ${selectedCampaignId === campaign.id ? "border-[#16A34A] bg-[#F0FDF4]" : "border-[#E6E8EC] bg-white hover:bg-[#F8FAFC]"}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-extrabold text-[#243041]">
                        {campaign.name}
                      </span>
                      <span className="mt-1 block text-[10px] text-[#7A8798]">
                        {campaign.purpose} ·{" "}
                        {campaign.callerType === "ai_voice"
                          ? (campaign.aiAgent?.name ?? "AI agent")
                          : (campaign.humanAgent?.name ?? "Human agent")}
                      </span>
                    </span>
                    <Chip tone="neutral">{campaign.status}</Chip>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#64748B]">
                    <span>{campaign.selectedContactCount} selected</span>
                    <span>
                      {campaign.eligibleCount} first-party checks passed
                    </span>
                    <span>{campaign.blockedCount} blocked</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {selectedCampaign ? (
            <OutboundCampaignRun campaign={selectedCampaign} />
          ) : null}

          <Card overflow>
            <CardHead
              title="Eligibility preview"
              sub={
                preview
                  ? `Checked ${new Date(preview.checkedAt).toLocaleString()}`
                  : "No preview selected"
              }
            />
            {preview ? (
              <div className="p-3.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-[8px] bg-[#F7F9FB] p-2">
                    <div className="text-[16px] font-extrabold">
                      {preview.selectedCount}
                    </div>
                    <div className="text-[10px] text-[#7A8798]">Selected</div>
                  </div>
                  <div className="rounded-[8px] bg-[#F0FDF4] p-2">
                    <div className="text-[16px] font-extrabold text-[#15803D]">
                      {preview.eligibleCount}
                    </div>
                    <div className="text-[10px] text-[#7A8798]">
                      First-party pass
                    </div>
                  </div>
                  <div className="rounded-[8px] bg-[#FEF3F2] p-2">
                    <div className="text-[16px] font-extrabold text-[#B42318]">
                      {preview.blockedCount}
                    </div>
                    <div className="text-[10px] text-[#7A8798]">Blocked</div>
                  </div>
                </div>
                <div className="mt-3 max-h-[250px] overflow-y-auto">
                  {preview.members.map((member) => (
                    <div
                      key={member.memberId}
                      className="flex items-center justify-between gap-2 border-b border-[#EEF0F3] py-2 text-[11px] last:border-0"
                    >
                      <span className="min-w-0 truncate font-semibold">
                        {member.name}
                        <span className="ml-2 font-normal text-[#7A8798]">
                          {member.phone}
                        </span>
                      </span>
                      <Chip tone={member.eligible ? "green" : "red"}>
                        {member.eligible
                          ? "First-party checks passed"
                          : readableReason(member.reasonCode)}
                      </Chip>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 text-[11px] leading-[1.6] text-[#7A8798]">
                Select a saved draft and run a fresh check. Missing consent,
                unpublished policy, opt-out, suppression, country mismatch and
                invalid numbers remain blocked.
              </div>
            )}
          </Card>

          <Card pad={15}>
            <h2 className="text-[12px] font-extrabold text-[#334155]">
              What the dialer does not do
            </h2>
            <p className="mt-1.5 text-[11px] leading-[1.6] text-[#64748B]">
              Only human agents dial, one call at a time; there is no predictive
              or AI auto-dialing, no browser softphone (your own phone rings),
              no voicemail detection, no external Do Not Call registry, and no
              provider cost estimate. Passing these checks does not confirm that
              consent is legally sufficient.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
