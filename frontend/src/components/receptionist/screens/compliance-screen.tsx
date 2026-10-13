"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askConfirm, askText } from "@/lib/ask-dialog";
import {
  checkVoiceEligibility,
  createVoiceCompliancePolicy,
  createVoiceCompliancePolicyVersion,
  createVoiceConsent,
  createVoiceSuppression,
  disableVoiceCompliancePolicy,
  fetchVoiceComplianceAudit,
  fetchVoiceComplianceOverview,
  fetchVoiceCompliancePolicies,
  fetchVoiceConsents,
  fetchVoiceSuppressions,
  publishVoiceCompliancePolicy,
  revokeVoiceConsent,
  revokeVoiceSuppression,
  type VoiceCompliancePolicyInput,
  type VoiceCompliancePolicyPack,
  type VoiceCompliancePolicyVersion,
  type VoicePolicyCallerType,
} from "@/lib/voice-compliance-api";
import { Card, CardHead, Chip, EmptyState, Footnote, PrimaryBtn } from "../rx-ui";
import { useRx } from "../rx-data";

const inputClass = "h-[35px] w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] outline-none focus:border-[#16A34A]";
const textAreaClass = "min-h-[80px] w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 py-2 text-[12px] leading-[1.5] outline-none focus:border-[#16A34A]";
const errorText = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : "The request could not be completed.";
const callerTypes: { value: VoicePolicyCallerType; label: string }[] = [
  { value: "ai_voice", label: "AI voice" },
  { value: "live_agent", label: "Live agent" },
  { value: "prerecorded", label: "Prerecorded" },
];
const localDateTime = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

type Tab = "overview" | "policies" | "consent" | "suppression" | "checks";

interface PolicyForm {
  countryCode: string;
  purpose: string;
  callerType: VoicePolicyCallerType;
  aiDisclosureText: string;
  recordingAllowed: boolean;
  recordingNoticeText: string;
  recordingRetentionDays: string;
  allowedWindowStart: string;
  allowedWindowEnd: string;
  timeZone: string;
}

const emptyPolicy: PolicyForm = {
  countryCode: "",
  purpose: "",
  callerType: "ai_voice",
  aiDisclosureText: "",
  recordingAllowed: false,
  recordingNoticeText: "",
  recordingRetentionDays: "",
  allowedWindowStart: "",
  allowedWindowEnd: "",
  timeZone: "",
};

export function ComplianceScreen() {
  const now = useRx().now;
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState("");
  const [policyForm, setPolicyForm] = useState<PolicyForm>(emptyPolicy);
  const [editingPackId, setEditingPackId] = useState("");
  const [consentForm, setConsentForm] = useState({
    phoneE164: "", purpose: "", callerType: "ai_voice" as VoicePolicyCallerType,
    source: "", noticeText: "", evidenceReference: "", legalBasis: "",
    grantedAt: localDateTime(), expiresAt: "", evidenceReviewed: false,
  });
  const [suppressionForm, setSuppressionForm] = useState({
    phoneE164: "", purpose: "", source: "", reason: "",
    effectiveAt: localDateTime(), expiresAt: "",
  });
  const [checkForm, setCheckForm] = useState({
    phoneE164: "", countryCode: "", purpose: "", callerType: "ai_voice" as VoicePolicyCallerType,
  });
  const [lastCheck, setLastCheck] = useState<Awaited<ReturnType<typeof checkVoiceEligibility>> | null>(null);

  const overview = useQuery({ queryKey: ["voice-compliance-overview"], queryFn: fetchVoiceComplianceOverview });
  const policies = useQuery({ queryKey: ["voice-compliance-policies"], queryFn: fetchVoiceCompliancePolicies });
  const consents = useQuery({ queryKey: ["voice-compliance-consents"], queryFn: fetchVoiceConsents });
  const suppressions = useQuery({ queryKey: ["voice-compliance-suppressions"], queryFn: fetchVoiceSuppressions });
  const audit = useQuery({ queryKey: ["voice-compliance-audit"], queryFn: fetchVoiceComplianceAudit });

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["voice-compliance-overview"] }),
      client.invalidateQueries({ queryKey: ["voice-compliance-policies"] }),
      client.invalidateQueries({ queryKey: ["voice-compliance-consents"] }),
      client.invalidateQueries({ queryKey: ["voice-compliance-suppressions"] }),
      client.invalidateQueries({ queryKey: ["voice-compliance-audit"] }),
    ]);
  };

  const savePolicy = useMutation({
    mutationFn: async (): Promise<void> => {
      const fields = policyPayload(policyForm);
      if (editingPackId) {
        await createVoiceCompliancePolicyVersion(editingPackId, fields);
      } else {
        await createVoiceCompliancePolicy({
          ...fields,
          countryCode: policyForm.countryCode.trim().toUpperCase(),
          purpose: policyForm.purpose.trim().toLowerCase(),
          callerType: policyForm.callerType,
        });
      }
    },
    onSuccess: async () => {
      setNotice(editingPackId ? "New policy draft version saved" : "Policy pack draft created");
      setPolicyForm(emptyPolicy);
      setEditingPackId("");
      await invalidate();
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const publishPolicy = useMutation({
    mutationFn: ({ versionId, reference }: { versionId: string; reference: string }) => publishVoiceCompliancePolicy(versionId, reference),
    onSuccess: async () => { setNotice("Policy published with your legal-review attestation"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const disablePolicy = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => disableVoiceCompliancePolicy(id, reason),
    onSuccess: async () => { setNotice("Policy pack disabled; eligibility checks now fail closed"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const saveConsent = useMutation({
    mutationFn: () => createVoiceConsent({
      ...consentForm,
      purpose: consentForm.purpose.trim().toLowerCase(),
      grantedAt: new Date(consentForm.grantedAt).toISOString(),
      expiresAt: consentForm.expiresAt ? new Date(consentForm.expiresAt).toISOString() : null,
      evidenceReviewed: true,
    }),
    onSuccess: async () => {
      setNotice("Consent proof recorded and attested by this business user");
      setConsentForm({ phoneE164: "", purpose: "", callerType: "ai_voice", source: "", noticeText: "", evidenceReference: "", legalBasis: "", grantedAt: localDateTime(), expiresAt: "", evidenceReviewed: false });
      await invalidate();
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const revokeConsent = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => revokeVoiceConsent(id, reason),
    onSuccess: async () => { setNotice("Consent revoked; later checks will block the purpose"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const saveSuppression = useMutation({
    mutationFn: () => createVoiceSuppression({
      ...suppressionForm,
      purpose: suppressionForm.purpose.trim() ? suppressionForm.purpose.trim().toLowerCase() : null,
      effectiveAt: new Date(suppressionForm.effectiveAt).toISOString(),
      expiresAt: suppressionForm.expiresAt ? new Date(suppressionForm.expiresAt).toISOString() : null,
    }),
    onSuccess: async () => {
      setNotice("First-party suppression entry added");
      setSuppressionForm({ phoneE164: "", purpose: "", source: "", reason: "", effectiveAt: localDateTime(), expiresAt: "" });
      await invalidate();
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const revokeSuppression = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => revokeVoiceSuppression(id, reason),
    onSuccess: async () => { setNotice("Suppression removed with an audit reason"); await invalidate(); },
    onError: (error) => setNotice(errorText(error)),
  });
  const check = useMutation({
    mutationFn: () => checkVoiceEligibility({
      ...checkForm,
      countryCode: checkForm.countryCode.trim().toUpperCase(),
      purpose: checkForm.purpose.trim().toLowerCase(),
    }),
    onSuccess: async (result) => { setLastCheck(result); await invalidate(); },
    onError: (error) => { setLastCheck(null); setNotice(errorText(error)); },
  });

  const policiesData = policies.data ?? [];
  const consentsData = consents.data ?? [];
  const suppressionData = suppressions.data ?? [];
  const auditData = audit.data ?? [];
  const queryError = [overview, policies, consents, suppressions, audit].find((query) => query.error)?.error;
  const pending = overview.isPending || policies.isPending || consents.isPending || suppressions.isPending || audit.isPending;

  const chooseVersion = (version: VoiceCompliancePolicyVersion) => {
    setPolicyForm((current) => ({
      ...current,
      aiDisclosureText: version.aiDisclosureText,
      recordingAllowed: version.recordingAllowed,
      recordingNoticeText: version.recordingNoticeText ?? "",
      recordingRetentionDays: version.recordingRetentionDays == null ? "" : String(version.recordingRetentionDays),
      allowedWindowStart: version.allowedWindowStart ?? "",
      allowedWindowEnd: version.allowedWindowEnd ?? "",
      timeZone: version.timeZone ?? "",
    }));
  };

  const publish = async (version: VoiceCompliancePolicyVersion) => {
    const reference = await askText({
      title: "Legal review reference",
      description: "Enter the reference for the review completed by your legal/compliance adviser. Noxtill cannot verify this review.",
      placeholder: "Ticket, document or internal reference",
      minLength: 4,
      confirmLabel: "Continue",
    });
    if (!reference) return;
    const confirmed = await askConfirm({
      title: `Publish policy version ${version.version}?`,
      description: "Confirm that your business has reviewed these rules for this region and use case. This is an attestation, not a legal approval from Noxtill.",
      confirmLabel: "Publish after review",
    });
    if (!confirmed) return;
    publishPolicy.mutate({ versionId: version.id, reference });
  };

  const disable = async (pack: VoiceCompliancePolicyPack) => {
    const reason = await askText({
      title: "Disable policy pack",
      description: "Eligibility checks for this region, purpose and caller type will be blocked until a new policy version is published.",
      placeholder: "Reason for disabling",
      minLength: 8,
      tone: "danger",
      confirmLabel: "Disable policy",
    });
    if (reason) disablePolicy.mutate({ id: pack.id, reason });
  };

  const revoke = async (kind: "consent" | "suppression", id: string) => {
    const reason = await askText({
      title: kind === "consent" ? "Revoke consent" : "Remove suppression",
      description: kind === "consent" ? "This immediately invalidates matching outbound eligibility checks." : "Removing a suppression can make this number eligible if all other checks pass.",
      placeholder: "Required audit reason",
      minLength: 8,
      tone: kind === "consent" ? "danger" : "default",
      confirmLabel: kind === "consent" ? "Revoke consent" : "Remove suppression",
    });
    if (!reason) return;
    if (kind === "consent") revokeConsent.mutate({ id, reason });
    else revokeSuppression.mutate({ id, reason });
  };

  const setField = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) => setPolicyForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[16px] font-extrabold">Consent &amp; Compliance</div>
          <div className="mt-1 text-[11.5px] text-[#7A8798]">Business-owned outbound policy, consent evidence, suppression and decision trace.</div>
        </div>
        <Chip tone="amber">Unknown or unapproved policy = blocked</Chip>
      </div>

      {queryError ? <InlineNotice tone="error">{errorText(queryError)}</InlineNotice> : null}
      {notice ? <InlineNotice tone="neutral">{notice}</InlineNotice> : null}

      <div className="flex flex-wrap gap-1.5 rounded-[11px] border border-[#E6E8EC] bg-white p-1.5">
        {([
          ["overview", "Overview"], ["policies", "Policy packs"], ["consent", "Consent evidence"], ["suppression", "Suppressions"], ["checks", "Eligibility & audit"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`h-[31px] rounded-[7px] px-3 text-[11px] font-bold ${tab === key ? "bg-[#EAF8F1] text-[#137C48]" : "bg-white text-[#647184] hover:bg-[#F5F6F8]"}`}>{label}</button>
        ))}
      </div>

      {pending ? <Card><div className="p-4 text-[12px] text-[#7A8798]">Loading real compliance records…</div></Card> : null}

      {tab === "overview" && overview.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Policy packs" value={overview.data.policyPacks} sub={`${overview.data.policiesPublished} currently published`} />
            <Metric label="Policy not published" value={overview.data.unapprovedPolicyPacks} sub="Calls remain blocked until reviewed and published" />
            <Metric label="Verified active consent" value={overview.data.verifiedActiveConsents} sub="Business-attested records with a proof reference" />
            <Metric label="Blocked checks · 30 days" value={overview.data.blockedChecksLast30Days} sub={`${overview.data.activeFirstPartySuppressions} active first-party suppressions`} />
          </div>
          <Card overflow>
            <CardHead title="Policy health" sub="Coverage is measured from business-configured records only" />
            <div className="grid gap-2 p-4 md:grid-cols-3">
              <HealthRow title="External DNC registry" value="Not configured" description="No licensed registry is connected; only this business's own suppressions are checked." />
              <HealthRow title="Number ownership" value="Not tracked" description="No ownership-verification provider or proof record exists." />
              <HealthRow title="Recording retention" value="See Phone Settings" description="The existing call-recording retention job remains the source of truth." />
            </div>
          </Card>
          <Card overflow>
            <CardHead title="Fail-closed decision path" sub="Each check stores a decision ID and the policy version it used" />
            <div className="grid gap-2 p-4 md:grid-cols-4">
              <Step title="Published policy" text="Region + purpose + caller type" />
              <Step title="Consent proof" text="Exact number + matching purpose" />
              <Step title="Suppression" text="Global or purpose-specific stop" />
              <Step title="Time window" text="Business-entered local hours, if configured" />
            </div>
          </Card>
        </>
      ) : null}

      {tab === "policies" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,.82fr)_minmax(0,1.18fr)]">
          <Card overflow>
            <CardHead title={editingPackId ? "New policy version" : "Create policy draft"} sub="No regional law pack is pre-filled or treated as legal advice" />
            <div className="grid gap-2.5 p-4">
              {!editingPackId ? <div className="grid grid-cols-2 gap-2">
                <Field label="Country code"><input className={inputClass} value={policyForm.countryCode} onChange={(event) => setField("countryCode", event.target.value.toUpperCase())} placeholder="US" maxLength={2} /></Field>
                <Field label="Outbound purpose"><input className={inputClass} value={policyForm.purpose} onChange={(event) => setField("purpose", event.target.value)} placeholder="sales / booking / support" maxLength={40} /></Field>
                <Field label="Caller type"><select className={inputClass} value={policyForm.callerType} onChange={(event) => setField("callerType", event.target.value as VoicePolicyCallerType)}>{callerTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
              </div> : <InlineNotice tone="neutral">Editing a new version of an existing policy pack. The currently published version remains active until this draft is published.</InlineNotice>}
              <Field label="AI disclosure copy"><textarea className={textAreaClass} value={policyForm.aiDisclosureText} onChange={(event) => setField("aiDisclosureText", event.target.value)} placeholder="Enter disclosure text reviewed for this policy pack" maxLength={2000} /></Field>
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[#45505F]"><input type="checkbox" checked={policyForm.recordingAllowed} onChange={(event) => setField("recordingAllowed", event.target.checked)} /> Recording is allowed under this business policy</label>
              {policyForm.recordingAllowed ? <>
                <Field label="Recording notice"><textarea className={textAreaClass} value={policyForm.recordingNoticeText} onChange={(event) => setField("recordingNoticeText", event.target.value)} placeholder="Region-specific recording notice" maxLength={2000} /></Field>
                <Field label="Retention days"><input className={inputClass} type="number" min={1} max={3650} value={policyForm.recordingRetentionDays} onChange={(event) => setField("recordingRetentionDays", event.target.value)} placeholder="Enter reviewed limit" /></Field>
              </> : null}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Calling window start"><input className={inputClass} type="time" value={policyForm.allowedWindowStart} onChange={(event) => setField("allowedWindowStart", event.target.value)} /></Field>
                <Field label="Calling window end"><input className={inputClass} type="time" value={policyForm.allowedWindowEnd} onChange={(event) => setField("allowedWindowEnd", event.target.value)} /></Field>
                <Field label="IANA time zone"><input className={inputClass} value={policyForm.timeZone} onChange={(event) => setField("timeZone", event.target.value)} placeholder="America/New_York" /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryBtn disabled={savePolicy.isPending || !policyForm.aiDisclosureText.trim() || (editingPackId ? false : policyForm.countryCode.trim().length !== 2 || !policyForm.purpose.trim())} onClick={() => savePolicy.mutate()}>{editingPackId ? "Save draft version" : "Create draft pack"}</PrimaryBtn>
                {editingPackId ? <button type="button" className="h-[34px] rounded-[8px] border border-[#D5DAE2] bg-white px-3 text-[11px] font-bold" onClick={() => { setEditingPackId(""); setPolicyForm(emptyPolicy); }}>Cancel</button> : null}
              </div>
            </div>
          </Card>

          <Card overflow>
            <CardHead title="Policy packs & versions" sub="Publishing requires a business legal-review reference and explicit attestation" />
            {policiesData.length ? policiesData.map((pack) => <PolicyPackRow key={pack.id} pack={pack} onVersion={chooseVersion} onNewVersion={() => { setEditingPackId(pack.id); const current = pack.versions.find((item) => item.status === "published") ?? pack.versions[0]; if (current) chooseVersion(current); }} onPublish={publish} onDisable={disable} busy={publishPolicy.isPending || disablePolicy.isPending} />) : <EmptyState icon="shield-check" title="No policy packs" body="No outbound geography or use-case policy has been entered. Eligibility checks stay blocked until a policy is reviewed and published." />}
            <Footnote>A published version is a business configuration record. The legal-review reference is an owner-entered attestation; Noxtill does not validate laws or certify compliance.</Footnote>
          </Card>
        </div>
      ) : null}

      {tab === "consent" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(340px,.82fr)_minmax(0,1.18fr)]">
          <Card overflow>
            <CardHead title="Record consent evidence" sub="Consent is only considered after the operator attests they reviewed proof" />
            <div className="grid gap-2.5 p-4">
              <Field label="Phone number · E.164"><input className={inputClass} value={consentForm.phoneE164} onChange={(event) => setConsentForm({ ...consentForm, phoneE164: event.target.value })} placeholder="+14155550123" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Purpose"><input className={inputClass} value={consentForm.purpose} onChange={(event) => setConsentForm({ ...consentForm, purpose: event.target.value })} placeholder="sales / booking" /></Field>
                <Field label="Caller type"><select className={inputClass} value={consentForm.callerType} onChange={(event) => setConsentForm({ ...consentForm, callerType: event.target.value as VoicePolicyCallerType })}><option value="ai_voice">AI voice</option><option value="live_agent">Live agent</option></select></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Source"><input className={inputClass} value={consentForm.source} onChange={(event) => setConsentForm({ ...consentForm, source: event.target.value })} placeholder="web form / verbal" /></Field>
                <Field label="Legal basis label"><input className={inputClass} value={consentForm.legalBasis} onChange={(event) => setConsentForm({ ...consentForm, legalBasis: event.target.value })} placeholder="Business-provided label" /></Field>
              </div>
              <Field label="Notice copy actually shown/heard"><textarea className={textAreaClass} value={consentForm.noticeText} onChange={(event) => setConsentForm({ ...consentForm, noticeText: event.target.value })} /></Field>
              <Field label="Evidence reference"><input className={inputClass} value={consentForm.evidenceReference} onChange={(event) => setConsentForm({ ...consentForm, evidenceReference: event.target.value })} placeholder="Internal record or source reference" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Granted at"><input className={inputClass} type="datetime-local" value={consentForm.grantedAt} onChange={(event) => setConsentForm({ ...consentForm, grantedAt: event.target.value })} /></Field><Field label="Expires at · optional"><input className={inputClass} type="datetime-local" value={consentForm.expiresAt} onChange={(event) => setConsentForm({ ...consentForm, expiresAt: event.target.value })} /></Field></div>
              <label className="flex items-start gap-2 text-[10.5px] leading-[1.5] text-[#45505F]"><input type="checkbox" checked={consentForm.evidenceReviewed} onChange={(event) => setConsentForm({ ...consentForm, evidenceReviewed: event.target.checked })} /><span>I reviewed the referenced evidence and confirm the stored notice and purpose match it.</span></label>
              <PrimaryBtn disabled={saveConsent.isPending || !consentForm.evidenceReviewed || !consentForm.phoneE164 || !consentForm.purpose || !consentForm.source || !consentForm.evidenceReference || !consentForm.noticeText || !consentForm.legalBasis} onClick={() => saveConsent.mutate()}>Save attested evidence</PrimaryBtn>
            </div>
          </Card>
          <Card overflow>
            <CardHead title="Consent evidence" sub="Phone numbers are masked; revocation preserves the audit record" />
            {consentsData.length ? consentsData.map((item) => <ConsentRow key={item.id} item={item} now={now} onRevoke={() => revoke("consent", item.id)} />) : <EmptyState icon="contact-round" title="No consent records" body="No call consent evidence has been recorded for this business." />}
          </Card>
        </div>
      ) : null}

      {tab === "suppression" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,.75fr)_minmax(0,1.25fr)]">
          <Card overflow>
            <CardHead title="Add first-party suppression" sub="Use a null purpose to block every outbound purpose for the number" />
            <div className="grid gap-2.5 p-4">
              <Field label="Phone number · E.164"><input className={inputClass} value={suppressionForm.phoneE164} onChange={(event) => setSuppressionForm({ ...suppressionForm, phoneE164: event.target.value })} placeholder="+14155550123" /></Field>
              <Field label="Purpose · blank means all"><input className={inputClass} value={suppressionForm.purpose} onChange={(event) => setSuppressionForm({ ...suppressionForm, purpose: event.target.value })} placeholder="sales / booking" /></Field>
              <Field label="Source"><input className={inputClass} value={suppressionForm.source} onChange={(event) => setSuppressionForm({ ...suppressionForm, source: event.target.value })} placeholder="customer request / internal" /></Field>
              <Field label="Reason"><textarea className={textAreaClass} value={suppressionForm.reason} onChange={(event) => setSuppressionForm({ ...suppressionForm, reason: event.target.value })} placeholder="Why calls are blocked" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Effective at"><input className={inputClass} type="datetime-local" value={suppressionForm.effectiveAt} onChange={(event) => setSuppressionForm({ ...suppressionForm, effectiveAt: event.target.value })} /></Field><Field label="Expires at · optional"><input className={inputClass} type="datetime-local" value={suppressionForm.expiresAt} onChange={(event) => setSuppressionForm({ ...suppressionForm, expiresAt: event.target.value })} /></Field></div>
              <PrimaryBtn disabled={saveSuppression.isPending || !suppressionForm.phoneE164 || !suppressionForm.source || suppressionForm.reason.trim().length < 8} onClick={() => saveSuppression.mutate()}>Add suppression</PrimaryBtn>
            </div>
          </Card>
          <Card overflow>
            <CardHead title="Suppression records" sub="First-party entries only; external registry imports are not configured" />
            {suppressionData.length ? suppressionData.map((item) => <SuppressionRow key={item.id} item={item} now={now} onRevoke={() => revoke("suppression", item.id)} />) : <EmptyState icon="phone-off" title="No suppression entries" body="No business-managed voice suppression is currently recorded." />}
          </Card>
        </div>
      ) : null}

      {tab === "checks" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,.72fr)_minmax(0,1.28fr)]">
          <Card overflow>
            <CardHead title="Check outbound eligibility" sub="This records a decision only; it does not place a call" />
            <div className="grid gap-2.5 p-4">
              <Field label="Phone number · E.164"><input className={inputClass} value={checkForm.phoneE164} onChange={(event) => setCheckForm({ ...checkForm, phoneE164: event.target.value })} placeholder="+14155550123" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Country code"><input className={inputClass} value={checkForm.countryCode} onChange={(event) => setCheckForm({ ...checkForm, countryCode: event.target.value.toUpperCase() })} placeholder="US" maxLength={2} /></Field><Field label="Purpose"><input className={inputClass} value={checkForm.purpose} onChange={(event) => setCheckForm({ ...checkForm, purpose: event.target.value })} placeholder="sales / booking" /></Field></div>
              <Field label="Caller type"><select className={inputClass} value={checkForm.callerType} onChange={(event) => setCheckForm({ ...checkForm, callerType: event.target.value as VoicePolicyCallerType })}>{callerTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
              <PrimaryBtn disabled={check.isPending || !checkForm.phoneE164 || checkForm.countryCode.trim().length !== 2 || !checkForm.purpose} onClick={() => check.mutate()}>Run policy check</PrimaryBtn>
              {lastCheck ? <div className={`rounded-[9px] border p-3 ${lastCheck.allowed ? "border-[#A7E3C1] bg-[#F0FDF4]" : "border-[#F2C6C2] bg-[#FEF3F2]"}`}><div className="text-[12px] font-extrabold">{lastCheck.allowed ? "Eligible under configured checks" : "Blocked"}</div><div className="mt-1 text-[11px] leading-[1.5]">{lastCheck.message}</div><div className="mt-2 text-[10px] text-[#7A8798]">Decision {lastCheck.id} · policy v{lastCheck.policyVersion ?? "—"} · no call placed</div></div> : null}
            </div>
          </Card>
          <Card overflow>
            <CardHead title="Decision audit" sub="Latest recorded allow/block results, with the policy version used" />
            {auditData.length ? auditData.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-[#EEF0F3] px-4 py-3 last:border-0"><Chip tone={item.allowed ? "green" : "red"}>{item.allowed ? "Allowed by configured checks" : "Blocked"}</Chip><div className="min-w-[180px] flex-1 text-[11px] font-semibold">{item.phone} · {item.countryCode} · {item.purpose} · {item.callerType}</div><div className="text-[10px] text-[#7A8798]">{item.reasonCode} · policy v{item.policyVersion ?? "—"} · {new Date(item.evaluatedAt).toLocaleString()}</div></div>) : <EmptyState icon="clipboard-check" title="No eligibility checks" body="Checks and their decision IDs will be listed here after they are run." />}
          </Card>
        </div>
      ) : null}

      <Footnote>These records reflect business-entered evidence and decisions only. Noxtill is not legal advice; no country rules or third-party DNC registry are preloaded. The outbound dialer is not implemented yet, so the check endpoint does not start calls.</Footnote>
    </div>
  );
}

function PolicyPackRow({
  pack, onVersion, onNewVersion, onPublish, onDisable, busy,
}: {
  pack: VoiceCompliancePolicyPack;
  onVersion: (version: VoiceCompliancePolicyVersion) => void;
  onNewVersion: () => void;
  onPublish: (version: VoiceCompliancePolicyVersion) => void;
  onDisable: (pack: VoiceCompliancePolicyPack) => void;
  busy: boolean;
}) {
  return (
    <div className="border-b border-[#EEF0F3] px-4 py-3.5 last:border-0">
      <div className="flex flex-wrap items-start gap-2"><div className="min-w-[180px] flex-1"><div className="text-[12px] font-extrabold">{pack.countryCode} · {pack.purpose} · {pack.callerType.replaceAll("_", " ")}</div><div className="mt-1 text-[10px] text-[#7A8798]">Latest v{pack.latestVersion ?? "—"}</div></div><Chip tone={pack.status === "published" ? "green" : pack.status === "disabled" ? "red" : "amber"}>{pack.status}</Chip></div>
      {pack.versions.map((version) => <div key={version.id} className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] bg-[#F8FAFC] px-2.5 py-2"><Chip tone={version.status === "published" ? "green" : version.status === "draft" ? "amber" : "neutral"}>v{version.version} · {version.status}</Chip><span className="min-w-[140px] flex-1 text-[10px] text-[#647184]">Recording {version.recordingAllowed ? "enabled by policy" : "not permitted"}{version.allowedWindowStart ? ` · ${version.allowedWindowStart}–${version.allowedWindowEnd} ${version.timeZone}` : " · no hours configured"}</span>{version.status === "draft" ? <><button type="button" className="h-[27px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[10px] font-bold" onClick={() => onVersion(version)}>Load into editor</button><button type="button" className="h-[27px] rounded-[7px] border border-[#A7E3C1] bg-[#F0FDF4] px-2 text-[10px] font-bold text-[#137C48]" disabled={busy} onClick={() => onPublish(version)}>Publish after review</button></> : null}{version.status === "published" && !pack.disabledAt ? <button type="button" className="h-[27px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[10px] font-bold" onClick={onNewVersion}>New version</button> : null}</div>)}
      {!pack.disabledAt && pack.status !== "disabled" ? <button type="button" className="mt-2 h-[27px] rounded-[7px] border border-[#F2C6C2] bg-white px-2 text-[10px] font-bold text-[#B42318]" onClick={() => onDisable(pack)}>Disable this pack</button> : null}
    </div>
  );
}

function ConsentRow({ item, now, onRevoke }: { item: Awaited<ReturnType<typeof fetchVoiceConsents>>[number]; now: Date; onRevoke: () => void }) {
  const active = !item.revokedAt && (!item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime());
  return <div className="flex flex-wrap items-start gap-2 border-b border-[#EEF0F3] px-4 py-3 last:border-0"><div className="min-w-[180px] flex-1"><div className="text-[11px] font-bold">{item.phone} · {item.purpose} · {item.callerType ?? "any caller type"}</div><div className="mt-1 text-[10px] text-[#7A8798]">{item.source} · {item.legalBasis} · proof: {item.evidenceReference}</div><div className="mt-1 text-[10px] text-[#7A8798]">Granted {new Date(item.grantedAt).toLocaleString()}{item.expiresAt ? ` · expires ${new Date(item.expiresAt).toLocaleString()}` : " · no expiry recorded"}</div></div><Chip tone={active ? "green" : "neutral"}>{active ? "Active" : item.revokedAt ? "Revoked" : "Expired"}</Chip>{active ? <button type="button" className="h-[27px] rounded-[7px] border border-[#F2C6C2] bg-white px-2 text-[10px] font-bold text-[#B42318]" onClick={onRevoke}>Revoke</button> : null}</div>;
}

function SuppressionRow({ item, now, onRevoke }: { item: Awaited<ReturnType<typeof fetchVoiceSuppressions>>[number]; now: Date; onRevoke: () => void }) {
  const active = !item.revokedAt && new Date(item.effectiveAt).getTime() <= now.getTime() && (!item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime());
  return <div className="flex flex-wrap items-start gap-2 border-b border-[#EEF0F3] px-4 py-3 last:border-0"><div className="min-w-[180px] flex-1"><div className="text-[11px] font-bold">{item.phone} · {item.purpose ?? "all outbound purposes"}</div><div className="mt-1 text-[10px] text-[#7A8798]">{item.reason} · source: {item.source}</div><div className="mt-1 text-[10px] text-[#7A8798]">Effective {new Date(item.effectiveAt).toLocaleString()}{item.expiresAt ? ` · expires ${new Date(item.expiresAt).toLocaleString()}` : " · no expiry recorded"}</div></div><Chip tone={active ? "red" : "neutral"}>{active ? "Active block" : item.revokedAt ? "Removed" : "Not currently active"}</Chip>{active ? <button type="button" className="h-[27px] rounded-[7px] border border-[#D5DAE2] bg-white px-2 text-[10px] font-bold" onClick={onRevoke}>Remove with reason</button> : null}</div>;
}

function Metric({ label, value, sub }: { label: string; value: number; sub: string }) {
  return <div className="rounded-[12px] border border-[#E6E8EC] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,.04)]"><div className="text-[10.5px] font-bold text-[#5B6675]">{label}</div><div className="mt-1.5 text-[18px] font-extrabold tabular-nums text-[#0F172A]">{value}</div><div className="mt-1 text-[10px] text-[#7A8798]">{sub}</div></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-[10.5px] font-bold text-[#5B6675]"><span>{label}</span>{children}</label>;
}

function InlineNotice({ children, tone }: { children: string; tone: "error" | "neutral" }) {
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-[9px] border px-3 py-2 text-[11.5px] ${tone === "error" ? "border-[#FBD5D2] bg-[#FEF3F2] text-[#B42318]" : "border-[#E6E8EC] bg-[#FCFCFD] text-[#5B6675]"}`}>{children}</div>;
}

function HealthRow({ title, value, description }: { title: string; value: string; description: string }) {
  return <div className="rounded-[10px] border border-[#EEF0F3] bg-[#FCFCFD] p-3"><div className="text-[10px] font-bold uppercase tracking-[.05em] text-[#7A8798]">{title}</div><div className="mt-1 text-[12px] font-extrabold">{value}</div><div className="mt-1 text-[10.5px] leading-[1.5] text-[#7A8798]">{description}</div></div>;
}

function Step({ title, text }: { title: string; text: string }) {
  return <div className="rounded-[10px] border border-[#EEF0F3] bg-[#FCFCFD] p-3"><div className="text-[11px] font-extrabold">{title}</div><div className="mt-1 text-[10px] text-[#7A8798]">{text}</div></div>;
}

function policyPayload(form: PolicyForm): Omit<VoiceCompliancePolicyInput, "countryCode" | "purpose" | "callerType"> {
  return {
    aiDisclosureText: form.aiDisclosureText.trim(),
    recordingAllowed: form.recordingAllowed,
    recordingNoticeText: form.recordingAllowed ? form.recordingNoticeText.trim() : null,
    recordingRetentionDays: form.recordingAllowed && form.recordingRetentionDays ? Number(form.recordingRetentionDays) : null,
    allowedWindowStart: form.allowedWindowStart || null,
    allowedWindowEnd: form.allowedWindowEnd || null,
    timeZone: form.allowedWindowStart ? form.timeZone.trim() : null,
  };
}
