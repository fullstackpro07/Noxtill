"use client";

import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { deriveOnboarding, improveDescription, type OnboardingCatalog, type OnboardingDraft } from "@/lib/onboarding-api";
import { toast } from "@/lib/toast";
import { countryByIso, ONBOARDING_COUNTRIES, type OnboardingCountry } from "./countries";
import { Check, Icon, SparkleIcon } from "./icons";
import { CardHeader, NavButtons, StepHeading, TOTAL_STEPS, cardStyle } from "./shell";

const EYEBROW = ["BASIC INFORMATION", "BUSINESS TYPE", "AI DISCOVERY", "ACTIVITIES", "REQUIREMENTS"];
const TITLES = ["Tell us about your business", "What type of business do you run?", "A few questions about how you work", "This is what we understood", "What would you like Noxtill to manage?"];
const CHIPS = ["Basics", "Business type", "Questions", "Activities", "Requirements"];

const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", height: 44, border: "1px solid #E2E8F0", borderRadius: 10, padding: "0 14px", fontSize: 14, color: "#0F172A", background: "#fff" };
const optional = <span style={{ color: "#94A3B8", fontWeight: 500 }}>(optional)</span>;

function Flag({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote flag thumbnails, as in the design
  return <img src={src} alt="" style={{ width: 22, height: 16, objectFit: "cover", borderRadius: 3, flex: "none", boxShadow: "0 0 0 1px rgba(15,23,42,.08)" }} />;
}

function CountryMenu({ selectedIso, onPick, width }: { selectedIso: string; onPick: (c: OnboardingCountry) => void; width?: number }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ONBOARDING_COUNTRIES.filter((c) => c.name.toLowerCase().includes(s) || c.dial.includes(s)) : ONBOARDING_COUNTRIES;
  }, [q]);
  return (
    <div style={{ position: "absolute", zIndex: 30, top: 48, left: 0, right: width ? undefined : 0, width, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, boxShadow: "0 20px 40px -20px rgba(15,23,42,.35)", padding: 8 }}>
      <input autoFocus placeholder="Search countries" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, height: 38, borderRadius: 8, padding: "0 12px", fontSize: 13.5, marginBottom: 6 }} />
      <div role="listbox" style={{ maxHeight: 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {list.map((c) => (
          <button
            key={c.iso}
            type="button"
            role="option"
            aria-selected={c.iso === selectedIso}
            onClick={() => onPick(c)}
            className="nx-hover-row"
            style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: c.iso === selectedIso ? "#F3FAF6" : "transparent", borderRadius: 8, padding: "9px 10px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "#0F172A", textAlign: "left" }}
          >
            <Flag src={c.flag} />
            <span style={{ flex: 1 }}>{c.name}</span>
            <span style={{ color: "#94A3B8", fontWeight: 500 }}>{c.dial}</span>
          </button>
        ))}
        {list.length === 0 && <p style={{ fontSize: 13, color: "#94A3B8", margin: "8px 10px" }}>No country matches “{q}”.</p>}
      </div>
    </div>
  );
}

export function Step2({
  catalog,
  draft,
  update,
  onAnalyze,
  analyzing,
}: {
  catalog: OnboardingCatalog;
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft> | ((d: OnboardingDraft) => Partial<OnboardingDraft>)) => void;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  const s2 = draft.s2 ?? 0;
  const basics = draft.basics ?? {};
  const category = draft.category ?? "Salon & Beauty";
  const bizType = draft.tags?.[0] ?? "";
  const [openMenu, setOpenMenu] = useState<"dial" | "country" | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [customDraft, setCustomDraft] = useState("");

  const d = useMemo(() => deriveOnboarding(catalog, { ...draft, category }), [catalog, draft, category]);
  const country = countryByIso(basics.countryIso);
  const dial = countryByIso(basics.dialIso ?? basics.countryIso);

  const setBasics = (patch: Partial<NonNullable<OnboardingDraft["basics"]>>) => update((cur) => ({ basics: { ...cur.basics, ...patch } }));
  const go = (n: number) => {
    update({ s2: n });
    window.scrollTo(0, 0);
  };

  function next() {
    if (s2 === 0 && (!basics.bizName || basics.bizName.trim().length < 2)) return toast.error("Add your business name to continue.");
    if (s2 === 0 && !basics.countryIso) return toast.error("Choose your country to continue.");
    if (s2 === 1 && !bizType) return toast.error("Pick the business type that best describes you.");
    if (s2 < 4) return go(s2 + 1);
    onAnalyze();
  }

  async function improve() {
    setAiBusy(true);
    try {
      const r = await improveDescription({ description: draft.desc ?? "", businessName: basics.bizName, businessType: bizType || category });
      setSuggestion(r.suggestion);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "AI suggestions aren't available right now.");
    } finally {
      setAiBusy(false);
    }
  }

  // Activity groups in first-seen order, exactly as derived from the answers.
  const groups: { group: string; items: typeof d.derived }[] = [];
  for (const a of d.derived) {
    let g = groups.find((x) => x.group === a.group);
    if (!g) groups.push((g = { group: a.group, items: [] }));
    g.items.push(a);
  }
  const reqIds = d.candidateIds.concat(Object.keys(catalog.reqLabel).filter((id) => !d.candidateIds.includes(id)));

  return (
    <div style={{ maxWidth: 1180 }}>
      <StepHeading
        eyebrow={`STEP 2 OF ${TOTAL_STEPS} · ${EYEBROW[s2]}`}
        title={TITLES[s2]}
        sub={
          [
            "We'll start with the basics — you can edit any of this later.",
            "Pick your industry and the closest business type, then describe it in your own words.",
            `Generated for ${bizType || category} — each answer changes what we ask next.`,
            "Derived from your answers, not a generic list. Untick anything you don't actually do.",
            "Your priorities order the recommendations — they never activate modules on their own.",
          ][s2]
        }
        subMargin="0 0 20px"
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {CHIPS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => go(i)}
            aria-current={i === s2 ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${i === s2 ? "#0E8A4A" : "#E8EBF0"}`, background: i === s2 ? "#F3FAF6" : "#fff", color: i <= s2 ? "#0F172A" : "#94A3B8", borderRadius: 99, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: i < s2 ? "#0E8A4A" : i === s2 ? "#12A150" : "#E8EBF0", color: i <= s2 ? "#fff" : "#94A3B8", fontSize: 11, display: "grid", placeItems: "center" }}>{i + 1}</span>
            {c}
          </button>
        ))}
      </div>

      <div className="nx-ob-two-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
        {s2 === 0 && (
          <div style={cardStyle}>
            <CardHeader icon={<Icon name="store" size={20} width={1.9} />} title="Business information" />
            <label style={label} htmlFor="ob-name">Business name</label>
            <input id="ob-name" placeholder="e.g. Green Leaf Salon" value={basics.bizName ?? ""} onChange={(e) => setBasics({ bizName: e.target.value })} style={{ ...input, padding: "0 15px", marginBottom: 13 }} />
            <label style={label} htmlFor="ob-email">Business email</label>
            <input id="ob-email" type="email" placeholder="you@business.com" value={basics.bizEmail ?? ""} onChange={(e) => setBasics({ bizEmail: e.target.value })} style={{ ...input, background: "#F8FAFC", marginBottom: 16 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={label} htmlFor="ob-phone">Phone number</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: "none" }}>
                    <button
                      type="button"
                      aria-label="Dialling code"
                      aria-expanded={openMenu === "dial"}
                      onClick={() => setOpenMenu(openMenu === "dial" ? null : "dial")}
                      style={{ height: 44, minWidth: 104, border: "1px solid #E2E8F0", borderRadius: 10, padding: "0 10px", fontSize: 14, fontWeight: 600, background: "#F8FAFC", color: "#0F172A", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Flag src={dial.flag} />
                      {dial.dial}
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {openMenu === "dial" && (
                      <CountryMenu
                        width={280}
                        selectedIso={dial.iso}
                        onPick={(c) => {
                          setBasics({ dialIso: c.iso, dialCode: c.dial });
                          setOpenMenu(null);
                        }}
                      />
                    )}
                  </div>
                  <input id="ob-phone" type="tel" placeholder="(201) 555-0123" value={basics.phone ?? ""} onChange={(e) => setBasics({ phone: e.target.value, dialCode: dial.dial })} style={{ ...input, flex: 1, minWidth: 0 }} />
                </div>
              </div>
              <div>
                <label style={label} htmlFor="ob-web">Website {optional}</label>
                <input id="ob-web" placeholder="www.yourwebsite.com" value={basics.website ?? ""} onChange={(e) => setBasics({ website: e.target.value })} style={input} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              <div>
                <span style={label}>Country</span>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    aria-expanded={openMenu === "country"}
                    onClick={() => setOpenMenu(openMenu === "country" ? null : "country")}
                    style={{ width: "100%", height: 44, border: "1px solid #E2E8F0", borderRadius: 10, padding: "0 12px", fontSize: 14, fontWeight: 600, background: "#fff", color: basics.countryIso ? "#0F172A" : "#94A3B8", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Flag src={country.flag} />
                    <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{basics.countryIso ? country.name : "Choose your country"}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" style={{ flex: "none" }} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  {openMenu === "country" && (
                    <CountryMenu
                      selectedIso={country.iso}
                      onPick={(c) => {
                        setBasics({ countryIso: c.iso, countryName: c.name, currency: c.currency, dialIso: c.iso, dialCode: c.dial });
                        setOpenMenu(null);
                      }}
                    />
                  )}
                </div>
              </div>
              <div>
                <label style={label} htmlFor="ob-city">State / City {optional}</label>
                <input id="ob-city" placeholder="e.g. New York" value={basics.city ?? ""} onChange={(e) => setBasics({ city: e.target.value })} style={input} />
              </div>
            </div>
          </div>
        )}

        {s2 === 1 && (
          <>
            <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <CardHeader
                margin={20}
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                    <rect x="3" y="3" width="7" height="7" rx="1.6" />
                    <rect x="14" y="3" width="7" height="7" rx="1.6" />
                    <rect x="3" y="14" width="7" height="7" rx="1.6" />
                    <rect x="14" y="14" width="7" height="7" rx="1.6" />
                  </svg>
                }
                title="What industry is your business in?"
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
                {catalog.categories.map((c) => {
                  const on = category === c.name;
                  return (
                    <button
                      key={c.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => on || update({ category: c.name, tags: [], discovery: {}, activities: [], touchedActs: false, reqs: [], touchedReqs: false })}
                      style={{ position: "relative", border: `1.5px solid ${on ? "#0E8A4A" : "#ECEFF3"}`, background: on ? "#F3FAF6" : "#fff", borderRadius: 13, padding: "16px 8px 13px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}
                    >
                      <Icon name={c.icon} size={22} color="#0F172A" width={1.7} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A", textAlign: "center", lineHeight: 1.25 }}>{c.name}</span>
                      {on && (
                        <span style={{ position: "absolute", top: 7, right: 7, width: 19, height: 19, borderRadius: "50%", background: "#0E8A4A", display: "grid", placeItems: "center" }}>
                          <Check size={11} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {category === "Other Business" && (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <input placeholder="What industry are you in? Type it here" value={draft.customIndustry ?? ""} onChange={(e) => update({ customIndustry: e.target.value })} style={{ ...input, flex: 1, minWidth: 220, border: "1px dashed #CBD5E1" }} />
                </div>
              )}
              <p style={{ fontSize: 14.5, fontWeight: 700, margin: "22px 0 12px" }}>
                Which best describes your business? <span style={{ color: "#94A3B8", fontWeight: 500 }}>({category})</span>
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
                {(catalog.subcats[category] ?? []).map((t) => {
                  const on = bizType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => on || update({ tags: [t], discovery: {}, activities: [], touchedActs: false, reqs: [], touchedReqs: false })}
                      style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${on ? "#0E8A4A" : "#E8EBF0"}`, background: on ? "#0E8A4A" : "#F6F8FA", color: on ? "#fff" : "#475569", borderRadius: 99, padding: "8px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
                    >
                      {t}
                      {on && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                          <path d="M5 5l14 14M19 5 5 19" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ ...cardStyle, gridColumn: "1 / -1", maxWidth: 760 }}>
              <CardHeader margin={18} icon={<Icon name="file" size={20} width={1.9} />} title="Tell us what your business does" />
              <textarea
                aria-label="Business description"
                placeholder="What does your business do? What products or services do you offer? How do you work with customers?"
                value={draft.desc ?? ""}
                maxLength={500}
                onChange={(e) => update({ desc: e.target.value })}
                rows={5}
                style={{ width: "100%", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 15px", fontSize: 15.5, lineHeight: 1.55, resize: "vertical", color: "#0F172A" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <button
                  type="button"
                  onClick={improve}
                  disabled={aiBusy}
                  className="nx-hover-soft"
                  style={{ display: "flex", alignItems: "center", gap: 9, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 11, padding: "11px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", color: "#0F172A" }}
                >
                  <SparkleIcon size={17} />
                  {aiBusy ? "Improving…" : "Improve with AI"}
                </button>
                <span style={{ fontSize: 13, color: "#94A3B8" }}>{(draft.desc ?? "").length}/500</span>
              </div>
              {suggestion && (
                <div style={{ marginTop: 14, border: "1px solid #DEF0E6", background: "#F3FAF6", borderRadius: 12, padding: "14px 16px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#0B6E3B", letterSpacing: ".04em" }}>AI SUGGESTION — REVIEW BEFORE REPLACING</p>
                  <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.55, color: "#0F172A" }}>{suggestion}</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        update({ desc: suggestion });
                        setSuggestion("");
                      }}
                      style={{ border: 0, background: "#0B8A49", color: "#fff", borderRadius: 9, padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
                    >
                      Use this
                    </button>
                    <button type="button" onClick={() => setSuggestion("")} style={{ border: "1px solid #E2E8F0", background: "#fff", color: "#334155", borderRadius: 9, padding: "9px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                      Keep mine
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {s2 === 2 && (
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 18 }}>
              <SparkleIcon />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0B6E3B" }}>{bizType ? `Questions generated from your ${bizType} answers` : "Pick your business type first to tailor these questions"}</span>
            </div>
            {d.visibleQs.map((q) => {
              const picked = draft.discovery?.[q.id] ?? [];
              return (
                <div key={q.id} style={{ marginBottom: 22 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{q.q}</p>
                  <p style={{ fontSize: 13.5, color: "#94A3B8", margin: "0 0 11px" }}>{q.hint ?? "Select everything that applies."}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                    {q.options.map((o) => {
                      const on = picked.includes(o.label);
                      return (
                        <button
                          key={o.label}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            update((cur) => {
                              const curPicked = cur.discovery?.[q.id] ?? [];
                              return {
                                discovery: { ...cur.discovery, [q.id]: on ? curPicked.filter((v) => v !== o.label) : curPicked.concat(o.label) },
                                touchedActs: false,
                              };
                            })
                          }
                          style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${on ? "#0E8A4A" : "#ECEFF3"}`, background: on ? "#F3FAF6" : "#fff", color: on ? "#0B6E3B" : "#0F172A", borderRadius: 12, padding: "13px 38px 13px 14px", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 600 }}
                        >
                          {o.label}
                          {on && (
                            <span style={{ position: "absolute", top: "50%", right: 12, transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: "#0E8A4A", display: "grid", placeItems: "center" }}>
                              <Check />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>These questions come from Noxtill&apos;s discovery guide for your business type — every answer is re-checked against the real module registry in Step 3.</p>
          </div>
        )}

        {s2 === 3 && (
          <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
            <CardHeader margin={18} icon={<Icon name="list" size={20} width={1.9} />} title="How does your business work?" />
            {groups.map((g) => (
              <div key={g.group} style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".07em", color: "#94A3B8", margin: "0 0 10px" }}>{g.group}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                  {g.items.map((a) => {
                    const on = d.activeActs.some((x) => x.name === a.name);
                    return (
                      <button
                        key={a.name}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          update((cur) => {
                            const base = cur.touchedActs ? (cur.activities ?? []) : d.derived.map((x) => x.name);
                            return { touchedActs: true, activities: base.includes(a.name) ? base.filter((v) => v !== a.name) : base.concat(a.name) };
                          })
                        }
                        style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${on ? "#0E8A4A" : "#ECEFF3"}`, background: on ? "#F3FAF6" : "#fff", borderRadius: 12, padding: 12, cursor: "pointer", textAlign: "left" }}
                      >
                        <Icon name={a.icon} size={18} color={on ? "#0B8A49" : "#94A3B8"} style={{ flex: "none" }} />
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A", lineHeight: 1.3 }}>{a.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, margin: "4px 0 14px", flexWrap: "wrap" }}>
              <input placeholder="Something else you do? Add it" value={customDraft} onChange={(e) => setCustomDraft(e.target.value)} style={{ ...input, flex: 1, minWidth: 200, border: "1px dashed #CBD5E1" }} />
              <button
                type="button"
                className="nx-hover-soft"
                onClick={() => {
                  const v = customDraft.trim();
                  if (!v) return;
                  setCustomDraft("");
                  update((cur) => ({ customActs: (cur.customActs ?? []).concat(v), activities: cur.touchedActs ? (cur.activities ?? []).concat(v) : cur.activities }));
                }}
                style={{ display: "flex", alignItems: "center", gap: 7, height: 44, padding: "0 16px", border: "1px solid #E2E8F0", background: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", color: "#0F172A" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                Add activity
              </button>
            </div>
            <p style={{ fontSize: 13.5, color: "#64748B", margin: 0 }}>
              Derived from your {d.answeredCount} answers. {d.activeActs.length} selected — these are what we&apos;ll match modules against.
            </p>
          </div>
        )}

        {s2 === 4 && (
          <div style={{ ...cardStyle, gridColumn: "1 / -1", maxWidth: 820 }}>
            <CardHeader
              margin={18}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="4.6" />
                  <circle cx="12" cy="12" r=".6" fill="currentColor" />
                </svg>
              }
              title="Choose what Noxtill should manage"
            />
            <p style={{ fontSize: 14, color: "#64748B", margin: "0 0 14px" }}>You might do all of these — tick only what you want Noxtill to handle. Anything you leave off stays out of your workspace.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
              {reqIds.map((id) => {
                const on = d.matchedIds.includes(id);
                const suggested = d.candidateIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update((cur) => {
                        const base = cur.touchedReqs ? (cur.reqs ?? []) : d.candidateIds;
                        return { touchedReqs: true, reqs: base.includes(id) ? base.filter((v) => v !== id) : base.concat(id) };
                      })
                    }
                    style={{ display: "flex", alignItems: "center", gap: 11, border: `1.5px solid ${on ? "#0E8A4A" : "#E8EBF0"}`, background: on ? "#F3FAF6" : "#fff", color: on ? "#0B6E3B" : "#475569", borderRadius: 12, padding: "13px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.8px solid ${on ? "#0E8A4A" : "#CBD5E1"}`, background: on ? "#0E8A4A" : "#fff", flex: "none", display: "grid", placeItems: "center" }}>{on && <Check />}</span>
                    <span style={{ flex: 1 }}>{catalog.reqLabel[id] ?? id}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".05em", color: suggested ? "#0B6E3B" : "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{suggested ? "Suggested" : "Also available"}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".07em", color: "#94A3B8", margin: "22px 0 10px" }}>POTENTIAL MODULE MATCHES ({d.matchedIds.length})</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {catalog.modules
                .filter((m) => d.matchedIds.includes(m.id))
                .map((m) => (
                  <span key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, border: "1px solid #E8EBF0", borderRadius: 10, padding: "9px 13px", fontSize: 13.5, fontWeight: 600 }}>
                    <Icon name={m.icon} size={18} color={m.color} />
                    {m.name}
                  </span>
                ))}
            </div>
            <p style={{ fontSize: 13, color: "#64748B", margin: "12px 0 0" }}>Initial mapping only — validated in Step 3 and approved by you in Step 4.</p>
          </div>
        )}
      </div>

      <NavButtons onBack={() => s2 > 0 && go(s2 - 1)} backDisabled={s2 === 0} onNext={next} nextDisabled={analyzing} nextLabel={s2 === 4 ? (analyzing ? "Starting analysis…" : "Analyze My Business") : "Continue"} />
    </div>
  );
}
