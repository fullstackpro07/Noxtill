"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  CUSTOMER_PORTAL_FEATURES,
  CUSTOMER_PORTAL_HOME_CARDS,
  fetchCustomerPortalAccounts,
  fetchCustomerPortalLayouts,
  fetchCustomerPortalOverview,
  fetchCustomerPortalSettings,
  createCustomerPortalInvite,
  publishCustomerPortalLayout,
  restoreCustomerPortalLayout,
  revokeCustomerPortalInvite,
  saveCustomerPortalLayout,
  setCustomerPortalAccountActive,
  updateCustomerPortalSettings,
  type CustomerPortalCard,
  type CustomerPortalFeature,
  type CustomerPortalLayout,
  type CustomerPortalSettings,
} from "@/lib/customer-portal-api";

const featureLabels: Record<
  CustomerPortalFeature,
  { title: string; description: string }
> = {
  orders: {
    title: "Orders & tracking",
    description: "Customer orders, items and recorded payment history.",
  },
  bookings: {
    title: "Bookings & queue",
    description: "Appointments, waitlist status and queue tokens.",
  },
  billing: {
    title: "Quotes, invoices & payments",
    description: "Canonical quotes, orders and recorded payments.",
  },
  returns: {
    title: "Returns & refunds",
    description:
      "Customers can request a return; staff still review and approve it.",
  },
  support: {
    title: "Support & messages",
    description:
      "The page will clearly disclose that ticketing is not available yet.",
  },
  loyalty: {
    title: "Loyalty & memberships",
    description: "Existing loyalty, memberships, subscriptions and pre-orders.",
  },
  account: {
    title: "Customer account",
    description: "Customer-managed profile and portal sign-in.",
  },
};

const cardLabels: Record<CustomerPortalCard, string> = {
  orders: "Recent orders",
  bookings: "Upcoming bookings",
  billing: "Billing activity",
  returns: "Returns",
  loyalty: "Loyalty & memberships",
  support: "Support availability",
};

const surface =
  "rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] disabled:opacity-50";

function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-muted)]">
          {children}
        </p>
      </div>
    </header>
  );
}

function StateMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${error ? "border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] text-[var(--app-danger)]" : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)]"}`}
    >
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className={`${surface} p-5`}>
      <p className="text-sm text-[var(--app-text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-bold tabular-nums text-[var(--app-text)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--app-text-muted)]">{detail}</p>
    </article>
  );
}

function OverviewPanel() {
  const overview = useQuery({
    queryKey: ["customer-portal", "overview"],
    queryFn: fetchCustomerPortalOverview,
  });
  const settings = overview.data?.settings;
  const link = overview.data?.business
    ? `/portal/${overview.data.business.slug}/login`
    : null;
  const publicUrl =
    typeof window !== "undefined" && link
      ? `${window.location.origin}${link}`
      : link;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Customer Portal" title="Portal Overview">
        A secure self-service view over existing customer, order, booking,
        return and loyalty records.
      </PageHeader>
      {overview.isLoading ? (
        <StateMessage>Loading portal metrics…</StateMessage>
      ) : overview.isError ? (
        <StateMessage error>
          Could not load portal overview. {overview.error.message}
        </StateMessage>
      ) : overview.data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Portal status"
              value={settings?.enabled ? "On" : "Off"}
              detail={
                settings?.enabled
                  ? "Customers can sign in"
                  : "Existing customer access is unchanged"
              }
            />
            <Metric
              label="Active accounts"
              value={overview.data.activeAccounts}
              detail="Customer identities enabled for this portal"
            />
            <Metric
              label="Active customers"
              value={overview.data.activeCustomers30Days}
              detail="Portal accounts with an active session used in the last 30 days"
            />
            <Metric
              label="Successful sign-ins"
              value={overview.data.signInsLast7Days}
              detail="Recorded customer sign-ins in the last 7 days"
            />
            <Metric
              label="Failed sign-ins"
              value={overview.data.failedSignInsLast7Days}
              detail="Recorded failures for recognized customer accounts; unknown emails cannot be attributed"
            />
            <Metric
              label="Self-service actions"
              value={overview.data.selfServiceActionsLast7Days}
              detail="Profile, booking and return actions recorded in the last 7 days"
            />
            <Metric
              label="Pending invites"
              value={overview.data.pendingInvites}
              detail="Unexpired invites not yet accepted"
            />
            <Metric
              label="Locked accounts"
              value={overview.data.currentlyLockedAccounts}
              detail="Active accounts currently locked after repeated sign-in failures"
            />
          </section>
          <section
            className={`${surface} flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between`}
          >
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">
                Customer sign-in link
              </h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Share this link after enabling the portal and inviting a
                customer.
              </p>
              <code className="mt-3 inline-block break-all rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs text-[var(--app-text)]">
                {publicUrl ?? "Loading…"}
              </code>
            </div>
            {link && (
              <a
                className={secondaryButton}
                href={link}
                target="_blank"
                rel="noreferrer"
              >
                Preview portal <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
          </section>
          <section className={`${surface} p-5`}>
            <h2 className="font-semibold text-[var(--app-text)]">
              Published home
            </h2>
            {overview.data.publishedLayout ? (
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                Version {overview.data.publishedLayout.version} · published{" "}
                {overview.data.publishedLayout.publishedAt
                  ? new Date(
                      overview.data.publishedLayout.publishedAt,
                    ).toLocaleString()
                  : "date unavailable"}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                No layout has been published. Customers will see the standard
                portal sections.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {settings?.enabledFeatures.map((feature) => (
                <span
                  key={feature}
                  className="rounded-full bg-[var(--app-primary-soft)] px-3 py-1 text-xs font-medium text-[var(--app-primary)]"
                >
                  {featureLabels[feature].title}
                </span>
              ))}
            </div>
          </section>
          <section className="grid gap-3 lg:grid-cols-3">
            {Object.entries(overview.data.unsupported).map(([key, message]) => (
              <article key={key} className={`${surface} p-4`}>
                <p className="font-semibold capitalize text-[var(--app-text)]">
                  {key.replace(/([A-Z])/g, " $1")}
                </p>
                <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                  {message}
                </p>
              </article>
            ))}
          </section>
          <section className={`${surface} overflow-hidden`}>
            <div className="border-b border-[var(--app-border)] p-5">
              <h2 className="font-semibold text-[var(--app-text)]">
                Recent portal activity
              </h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                Events recorded from customer portal actions only.
              </p>
            </div>
            {overview.data.recentActivity.length ? (
              <ul className="divide-y divide-[var(--app-border)]">
                {overview.data.recentActivity.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <span className="text-[var(--app-text)]">
                      {event.customer.name} · {event.event.replaceAll("_", " ")}
                    </span>
                    <time className="text-xs text-[var(--app-text-muted)]">
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">
                No customer portal activity has been recorded yet.
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function HomeBuilderPanel() {
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["customer-portal", "layouts"],
    queryFn: fetchCustomerPortalLayouts,
  });
  const customers = useQuery({
    queryKey: ["customer-portal", "preview-customers"],
    queryFn: fetchCustomerPortalAccounts,
  });
  const layoutVersions = versions.data ?? [];
  const initialLayout = useMemo((): CustomerPortalLayout => {
    const selected =
      versions.data?.find((entry) => entry.status === "draft") ??
      versions.data?.find((entry) => entry.status === "published");
    return (
      selected?.layout ?? {
        cards: ["orders", "bookings", "billing", "loyalty"],
        labels: [],
        announcements: [],
        quickActions: [],
        visibilityRules: [],
      }
    );
  }, [versions.data]);
  const [layoutOverride, setLayoutOverride] =
    useState<CustomerPortalLayout | null>(null);
  const [quickActionLabel, setQuickActionLabel] = useState("");
  const [quickActionDestination, setQuickActionDestination] =
    useState<CustomerPortalCard>("orders");
  const [previewCustomerId, setPreviewCustomerId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const layout = layoutOverride ?? initialLayout;
  const cards = layout.cards;
  const selectedPreviewCustomer = customers.data?.inviteCandidates.find(
    (customer) => customer.id === previewCustomerId,
  );
  const previewTags = Array.isArray(selectedPreviewCustomer?.tags)
    ? selectedPreviewCustomer.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLocaleLowerCase())
    : [];
  const visiblePreviewCards = cards.filter((card) => {
    const rule = layout.visibilityRules.find((item) => item.card === card);
    return !rule || rule.customerTags.some((tag) => previewTags.includes(tag));
  });
  function updateLayout(patch: Partial<CustomerPortalLayout>) {
    setLayoutOverride({ ...layout, ...patch });
  }
  function cardLabel(card: CustomerPortalCard) {
    return (
      layout.labels.find((item) => item.card === card)?.label ??
      cardLabels[card]
    );
  }
  function updateLabel(card: CustomerPortalCard, label: string) {
    const labels = layout.labels.filter((item) => item.card !== card);
    if (label.trim()) labels.push({ card, label });
    updateLayout({ labels });
  }
  function updateVisibility(card: CustomerPortalCard, value: string) {
    const customerTags = [
      ...new Set(
        value
          .split(",")
          .map((tag) => tag.trim().toLocaleLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 10);
    const visibilityRules = layout.visibilityRules.filter(
      (item) => item.card !== card,
    );
    if (customerTags.length) visibilityRules.push({ card, customerTags });
    updateLayout({ visibilityRules });
  }
  const draft = useMutation({
    mutationFn: () => saveCustomerPortalLayout(layout),
    onSuccess: async (result) => {
      toast.success(`Draft version ${result.version} saved`);
      setLayoutOverride(result.layout);
      await queryClient.invalidateQueries({
        queryKey: ["customer-portal", "layouts"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const publish = useMutation({
    mutationFn: publishCustomerPortalLayout,
    onSuccess: async () => {
      toast.success("Portal home published");
      await queryClient.invalidateQueries({ queryKey: ["customer-portal"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const restore = useMutation({
    mutationFn: restoreCustomerPortalLayout,
    onSuccess: async (result) => {
      setLayoutOverride(result.layout);
      toast.success(`Version ${result.version} restored as a new draft`);
      await queryClient.invalidateQueries({
        queryKey: ["customer-portal", "layouts"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    updateLayout({ cards: next });
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Customer Portal" title="Home Builder">
        Configure the customer home with canonical sections, labels,
        announcements, shortcuts and visibility rules based on the CRM tags
        already on each customer record.
      </PageHeader>
      {versions.isLoading ? (
        <StateMessage>Loading saved versions…</StateMessage>
      ) : versions.isError ? (
        <StateMessage error>
          Could not load layouts. {versions.error.message}
        </StateMessage>
      ) : (
        <>
          <section className={`${surface} p-5`}>
            <h2 className="font-semibold text-[var(--app-text)]">
              Home sections
            </h2>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              Sections read the business&apos;s existing records. Support,
              booking creation and online payment availability are disclosed
              from their actual service configuration.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ...cards,
                ...CUSTOMER_PORTAL_HOME_CARDS.filter(
                  (card) => !cards.includes(card),
                ),
              ].map((card) => (
                <div
                  key={card}
                  className="rounded-lg border border-[var(--app-border)] p-3"
                >
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-[var(--app-text)]">
                    <input
                      type="checkbox"
                      checked={cards.includes(card)}
                      onChange={(event) =>
                        updateLayout({
                          cards: event.target.checked
                            ? [...cards, card]
                            : cards.filter((item) => item !== card),
                          labels: layout.labels.filter(
                            (item) =>
                              event.target.checked || item.card !== card,
                          ),
                          visibilityRules: layout.visibilityRules.filter(
                            (item) =>
                              event.target.checked || item.card !== card,
                          ),
                        })
                      }
                      className="accent-[var(--app-primary)]"
                    />
                    {cardLabels[card]}
                  </label>
                  {cards.includes(card) && (
                    <div className="mt-2 flex justify-end gap-1">
                      <button
                        type="button"
                        className={secondaryButton}
                        aria-label={`Move ${cardLabels[card]} up`}
                        disabled={cards.indexOf(card) === 0}
                        onClick={() => move(cards.indexOf(card), -1)}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        aria-label={`Move ${cardLabels[card]} down`}
                        disabled={cards.indexOf(card) === cards.length - 1}
                        onClick={() => move(cards.indexOf(card), 1)}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  )}
                  {cards.includes(card) && (
                    <>
                      <label className="mt-3 block text-xs font-medium text-[var(--app-text-muted)]">
                        Customer-facing label
                        <input
                          className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                          maxLength={50}
                          value={
                            layout.labels.find((item) => item.card === card)
                              ?.label ?? ""
                          }
                          placeholder={cardLabels[card]}
                          onChange={(event) =>
                            updateLabel(card, event.target.value)
                          }
                        />
                      </label>
                      <label className="mt-3 block text-xs font-medium text-[var(--app-text-muted)]">
                        Show only for CRM tags (optional)
                        <input
                          className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                          placeholder="vip, member"
                          value={
                            layout.visibilityRules
                              .find((item) => item.card === card)
                              ?.customerTags.join(", ") ?? ""
                          }
                          onChange={(event) =>
                            updateVisibility(card, event.target.value)
                          }
                        />
                        <span className="mt-1 block font-normal">
                          A customer sees this section when at least one tag
                          matches.
                        </span>
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-[var(--app-border)] p-4">
              <h3 className="text-sm font-semibold text-[var(--app-text)]">
                Announcement
              </h3>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                One customer-facing message can be published on the home screen.
              </p>
              {(() => {
                const announcement = layout.announcements[0] ?? {
                  title: "",
                  body: "",
                  enabled: false,
                };
                return (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-[var(--app-text-muted)]">
                      Title
                      <input
                        className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                        maxLength={100}
                        value={announcement.title}
                        onChange={(event) =>
                          updateLayout({
                            announcements: [
                              { ...announcement, title: event.target.value },
                            ],
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--app-text)]">
                      <input
                        type="checkbox"
                        checked={announcement.enabled}
                        onChange={(event) =>
                          updateLayout({
                            announcements: [
                              {
                                ...announcement,
                                enabled: event.target.checked,
                              },
                            ],
                          })
                        }
                        className="accent-[var(--app-primary)]"
                      />
                      Show announcement after publishing
                    </label>
                    <label className="text-xs font-medium text-[var(--app-text-muted)] md:col-span-2">
                      Message
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                        maxLength={500}
                        value={announcement.body}
                        onChange={(event) =>
                          updateLayout({
                            announcements: [
                              { ...announcement, body: event.target.value },
                            ],
                          })
                        }
                      />
                    </label>
                  </div>
                );
              })()}
            </div>
            <div className="mt-6 rounded-lg border border-[var(--app-border)] p-4">
              <h3 className="text-sm font-semibold text-[var(--app-text)]">
                Quick actions
              </h3>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                Shortcuts only link to enabled portal sections; no external URLs
                are accepted.
              </p>
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!quickActionLabel.trim()) return;
                  updateLayout({
                    quickActions: [
                      ...layout.quickActions,
                      {
                        label: quickActionLabel.trim(),
                        destination: quickActionDestination,
                      },
                    ].slice(0, 6),
                  });
                  setQuickActionLabel("");
                }}
              >
                <input
                  className="min-w-48 flex-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                  maxLength={50}
                  aria-label="Quick action label"
                  placeholder="e.g. View my orders"
                  value={quickActionLabel}
                  onChange={(event) => setQuickActionLabel(event.target.value)}
                />
                <select
                  className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                  aria-label="Quick action destination"
                  value={quickActionDestination}
                  onChange={(event) =>
                    setQuickActionDestination(
                      event.target.value as CustomerPortalCard,
                    )
                  }
                >
                  {CUSTOMER_PORTAL_HOME_CARDS.filter((item) =>
                    cards.includes(item),
                  ).map((item) => (
                    <option key={item} value={item}>
                      {cardLabels[item]}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className={secondaryButton}
                  disabled={
                    !quickActionLabel.trim() ||
                    layout.quickActions.length >= 6 ||
                    !cards.length
                  }
                >
                  Add action
                </button>
              </form>
              {layout.quickActions.length > 0 && (
                <ul className="mt-3 divide-y divide-[var(--app-border)]">
                  {layout.quickActions.map((item, index) => (
                    <li
                      key={`${item.destination}-${index}`}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="text-[var(--app-text)]">
                        {item.label} → {cardLabels[item.destination]}
                      </span>
                      <button
                        type="button"
                        className="text-xs font-medium text-[var(--app-danger)]"
                        onClick={() =>
                          updateLayout({
                            quickActions: layout.quickActions.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className={primaryButton}
                disabled={draft.isPending || cards.length === 0}
                onClick={() => draft.mutate()}
                type="button"
              >
                Save draft
              </button>
              {layoutVersions.filter((entry) => entry.status === "draft")
                .length > 0 && (
                <button
                  className={secondaryButton}
                  disabled={publish.isPending}
                  onClick={() =>
                    publish.mutate(
                      layoutVersions.find((entry) => entry.status === "draft")!
                        .version,
                    )
                  }
                  type="button"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  Publish latest draft
                </button>
              )}
              <button
                className={secondaryButton}
                type="button"
                onClick={() => setPreviewOpen(!previewOpen)}
              >
                {previewOpen ? "Close customer preview" : "Preview as customer"}
              </button>
            </div>
          </section>
          {previewOpen && (
            <section className={`${surface} p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    Customer home preview
                  </h2>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    This preview uses the selected customer&apos;s canonical CRM
                    tags and the current unsaved layout.
                  </p>
                </div>
                <label className="text-xs font-medium text-[var(--app-text-muted)]">
                  Preview customer
                  <select
                    className="mt-1 block rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm text-[var(--app-text)]"
                    value={previewCustomerId}
                    onChange={(event) =>
                      setPreviewCustomerId(event.target.value)
                    }
                  >
                    <option value="">No customer segment selected</option>
                    {customers.data?.inviteCandidates.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {customers.isError && (
                <p className="mt-3 text-sm text-[var(--app-danger)]">
                  Could not load preview customers: {customers.error.message}
                </p>
              )}
              <div className="mt-4 rounded-xl bg-[var(--app-surface-muted)] p-4">
                <p className="text-sm text-[var(--app-text-muted)]">
                  {selectedPreviewCustomer
                    ? `Preview for ${selectedPreviewCustomer.name}`
                    : "Preview without a customer tag filter"}
                </p>
                {layout.announcements
                  .filter((item) => item.enabled)
                  .map((item, index) => (
                    <article
                      key={index}
                      className="mt-3 rounded-lg border border-[var(--app-primary)] bg-[var(--app-surface)] p-3"
                    >
                      <h3 className="font-semibold text-[var(--app-text)]">
                        {item.title}
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--app-text-muted)]">
                        {item.body}
                      </p>
                    </article>
                  ))}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {visiblePreviewCards.map((card) => (
                    <article
                      key={card}
                      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm font-medium text-[var(--app-text)]"
                    >
                      {cardLabel(card)}
                    </article>
                  ))}
                </div>
                {layout.quickActions.filter(
                  (item) =>
                    cards.includes(item.destination) &&
                    (!layout.visibilityRules.find(
                      (rule) => rule.card === item.destination,
                    ) ||
                      layout.visibilityRules
                        .find((rule) => rule.card === item.destination)!
                        .customerTags.some((tag) => previewTags.includes(tag))),
                ).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {layout.quickActions
                      .filter(
                        (item) =>
                          cards.includes(item.destination) &&
                          (!layout.visibilityRules.find(
                            (rule) => rule.card === item.destination,
                          ) ||
                            layout.visibilityRules
                              .find((rule) => rule.card === item.destination)!
                              .customerTags.some((tag) =>
                                previewTags.includes(tag),
                              )),
                      )
                      .map((item, index) => (
                        <span
                          key={`${item.destination}-${index}`}
                          className="rounded-lg bg-[var(--app-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--app-primary)]"
                        >
                          {item.label}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </section>
          )}
          <section className={`${surface} overflow-hidden`}>
            <div className="border-b border-[var(--app-border)] p-5">
              <h2 className="font-semibold text-[var(--app-text)]">
                Layout history
              </h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                Restore creates a new draft and preserves prior versions.
              </p>
            </div>
            {layoutVersions.length ? (
              <ul className="divide-y divide-[var(--app-border)]">
                {layoutVersions.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="font-medium text-[var(--app-text)]">
                        Version {entry.version}{" "}
                        <span className="ml-2 rounded-full bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs capitalize text-[var(--app-text-muted)]">
                          {entry.status}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                        {entry.layout.cards
                          .map(
                            (card) =>
                              entry.layout.labels.find(
                                (item) => item.card === card,
                              )?.label ?? cardLabels[card],
                          )
                          .join(" · ")}
                      </p>
                      <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                        {
                          entry.layout.announcements.filter(
                            (item) => item.enabled,
                          ).length
                        }{" "}
                        active announcement(s) ·{" "}
                        {entry.layout.quickActions.length} quick action(s) ·{" "}
                        {entry.layout.visibilityRules.length} tag rule(s)
                      </p>
                    </div>
                    {entry.status === "draft" ? (
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={publish.isPending}
                        onClick={() => publish.mutate(entry.version)}
                      >
                        Publish version
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(entry.version)}
                      >
                        Restore as draft
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-[var(--app-text-muted)]">
                No versions saved yet.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AccountsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["customer-portal", "accounts"],
    queryFn: fetchCustomerPortalAccounts,
  });
  const overview = useQuery({
    queryKey: ["customer-portal", "overview"],
    queryFn: fetchCustomerPortalOverview,
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: createCustomerPortalInvite,
    onSuccess: async (result) => {
      setInviteLink(`${window.location.origin}${result.invitePath}`);
      toast.success(
        "Invite created. Copy and share it with the customer yourself.",
      );
      await queryClient.invalidateQueries({
        queryKey: ["customer-portal", "accounts"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["customer-portal", "overview"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: revokeCustomerPortalInvite,
    onSuccess: async () => {
      toast.success("Invite revoked");
      await queryClient.invalidateQueries({
        queryKey: ["customer-portal", "accounts"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setCustomerPortalAccountActive(id, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-portal", "accounts"],
      });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Customer Portal" title="Customer Accounts">
        Portal identities belong to canonical CRM customers. Invites are
        one-use, time-limited links and are not emailed automatically.
      </PageHeader>
      {inviteLink && (
        <section className={`${surface} border-[var(--app-primary)] p-5`}>
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 text-[var(--app-primary)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-[var(--app-text)]">
                Invite link — shown once
              </h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Share securely with the intended customer. Noxtill has not sent
                this link.
              </p>
              <code className="mt-3 block break-all rounded-md bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text)]">
                {inviteLink}
              </code>
              <button
                type="button"
                className={`${secondaryButton} mt-3`}
                onClick={() =>
                  void navigator.clipboard.writeText(inviteLink).then(
                    () => toast.success("Invite link copied"),
                    () => toast.error("Could not copy the link"),
                  )
                }
              >
                <Copy className="h-4 w-4" aria-hidden />
                Copy link
              </button>
            </div>
          </div>
        </section>
      )}
      {query.isLoading ? (
        <StateMessage>Loading customer accounts…</StateMessage>
      ) : query.isError ? (
        <StateMessage error>
          Could not load accounts. {query.error.message}
        </StateMessage>
      ) : (
        query.data && (
          <>
            <section className={`${surface} overflow-hidden`}>
              <div className="border-b border-[var(--app-border)] p-5">
                <h2 className="font-semibold text-[var(--app-text)]">
                  Invite a customer
                </h2>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  Only active CRM customers with an email address and no portal
                  account are listed (up to 100).
                </p>
              </div>
              {query.data.inviteCandidates.length ? (
                <div className="divide-y divide-[var(--app-border)]">
                  {query.data.inviteCandidates.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    >
                      <div>
                        <p className="font-medium text-[var(--app-text)]">
                          {customer.name}
                        </p>
                        <p className="text-xs text-[var(--app-text-muted)]">
                          {customer.email} · {customer.phone}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={
                          !overview.data?.settings.enabled || invite.isPending
                        }
                        onClick={() => invite.mutate(customer.id)}
                      >
                        Create invite
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-[var(--app-text-muted)]">
                  No eligible customers are currently available to invite.
                </p>
              )}
              {!overview.data?.settings.enabled && (
                <p className="border-t border-[var(--app-border)] px-5 py-3 text-sm text-[var(--app-warning-text)]">
                  Enable the portal in Portal Settings before issuing invites.
                </p>
              )}
            </section>
            <section className={`${surface} overflow-hidden`}>
              <div className="border-b border-[var(--app-border)] p-5">
                <h2 className="font-semibold text-[var(--app-text)]">
                  Active portal accounts
                </h2>
              </div>
              {query.data.accounts.length ? (
                <div className="divide-y divide-[var(--app-border)]">
                  {query.data.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="font-medium text-[var(--app-text)]">
                          {account.customer.name}{" "}
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-xs ${account.active ? "bg-[var(--app-success-bg)] text-[var(--app-success-text)]" : "bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]"}`}
                          >
                            {account.active ? "Active" : "Disabled"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                          {account.customer.email} · {account.sessions.length}{" "}
                          active session
                          {account.sessions.length === 1 ? "" : "s"} · Last
                          sign-in{" "}
                          {account.lastSignedInAt
                            ? new Date(account.lastSignedInAt).toLocaleString()
                            : "Never"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({
                            id: account.id,
                            active: !account.active,
                          })
                        }
                      >
                        {account.active ? "Disable account" : "Enable account"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-[var(--app-text-muted)]">
                  No customer portal accounts yet.
                </p>
              )}
            </section>
            <section className={`${surface} overflow-hidden`}>
              <div className="border-b border-[var(--app-border)] p-5">
                <h2 className="font-semibold text-[var(--app-text)]">
                  Pending invites
                </h2>
              </div>
              {query.data.pendingInvites.length ? (
                <div className="divide-y divide-[var(--app-border)]">
                  {query.data.pendingInvites.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="font-medium text-[var(--app-text)]">
                          {item.customer.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                          Expires {new Date(item.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(item.id)}
                      >
                        Revoke invite
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-5 text-sm text-[var(--app-text-muted)]">
                  No unexpired invites.
                </p>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}

function SettingsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["customer-portal", "settings"],
    queryFn: fetchCustomerPortalSettings,
  });
  const [formOverride, setFormOverride] =
    useState<CustomerPortalSettings | null>(null);
  const form = formOverride ?? query.data ?? null;
  const save = useMutation({
    mutationFn: updateCustomerPortalSettings,
    onSuccess: async () => {
      setFormOverride(null);
      toast.success("Portal settings saved");
      await queryClient.invalidateQueries({ queryKey: ["customer-portal"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Customer Portal" title="Portal Settings & Branding">
        Control customer access and visible modules. Branding is read from the
        business profile so there is only one source of truth.
      </PageHeader>
      {query.isLoading ? (
        <StateMessage>Loading portal settings…</StateMessage>
      ) : query.isError ? (
        <StateMessage error>
          Could not load settings. {query.error.message}
        </StateMessage>
      ) : (
        form && (
          <>
            <section className={`${surface} p-5`}>
              <h2 className="font-semibold text-[var(--app-text)]">
                Branding and access
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-lg border border-[var(--app-border)] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                    Portal URL
                  </p>
                  <p className="mt-2 break-all text-sm text-[var(--app-text)]">
                    {query.data?.publicUrl ?? "Not available"}
                  </p>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    Custom domain: {query.data?.customDomain ?? "Not available"}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--app-border)] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                    Logo
                  </p>
                  {query.data?.branding.logoUrl ? (
                    <Image
                      src={query.data.branding.logoUrl}
                      alt={`${query.data.businessName} logo`}
                      width={40}
                      height={40}
                      unoptimized
                      className="mt-2 h-10 w-10 rounded-lg border border-[var(--app-border)] object-contain"
                    />
                  ) : (
                    <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                      {query.data?.branding.logoSource ?? "Not configured"}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    Source: {query.data?.branding.logoSource ?? "Not available"}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--app-border)] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                    Accent color
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-[var(--app-text)]">
                    {query.data?.branding.brandColor && (
                      <span
                        aria-hidden
                        className="h-5 w-5 rounded-full border border-[var(--app-border)]"
                        style={{
                          backgroundColor: query.data.branding.brandColor,
                        }}
                      />
                    )}
                    {query.data?.branding.brandColor ??
                      query.data?.branding.colorSource ??
                      "Not available"}
                  </div>
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    Source:{" "}
                    {query.data?.branding.colorSource ?? "Not available"}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--app-border)] p-4 sm:col-span-2 xl:col-span-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                    Authentication
                  </p>
                  <p className="mt-2 text-sm text-[var(--app-text)]">
                    {query.data?.authentication.method ?? "Not available"} ·{" "}
                    {query.data?.authentication.sessionDays ?? "—"} day sessions
                  </p>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    Customer MFA:{" "}
                    {query.data?.authentication.customerMfa ?? "Not available"}{" "}
                    · Contact verification:{" "}
                    {query.data?.authentication.contactVerification ??
                      "Not available"}
                  </p>
                </div>
              </div>
            </section>
            <section className={`${surface} p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    Customer sign-in
                  </h2>
                  <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                    Off by default. Disabling it also rejects existing portal
                    sessions.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--app-text)]">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) =>
                      setFormOverride({
                        ...form,
                        enabled: event.target.checked,
                      })
                    }
                    className="accent-[var(--app-primary)]"
                  />
                  Enable customer portal
                </label>
              </div>
              <div className="mt-6">
                <label
                  className="block text-sm font-semibold text-[var(--app-text)]"
                  htmlFor="portal-expiry"
                >
                  Invite expiry
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="portal-expiry"
                    className="w-32 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)]"
                    type="number"
                    min={24}
                    max={720}
                    value={form.inviteExpiryHours}
                    onChange={(event) =>
                      setFormOverride({
                        ...form,
                        inviteExpiryHours: Number(event.target.value),
                      })
                    }
                  />
                  <span className="text-sm text-[var(--app-text-muted)]">
                    hours (24–720)
                  </span>
                </div>
              </div>
            </section>
            <section className={`${surface} p-5`}>
              <h2 className="font-semibold text-[var(--app-text)]">
                Customer-visible sections
              </h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Each selected section reads only the signed-in customer&apos;s
                own canonical records.
              </p>
              <div className="mt-4 divide-y divide-[var(--app-border)]">
                {CUSTOMER_PORTAL_FEATURES.map((feature) => (
                  <label
                    key={feature}
                    className="flex cursor-pointer items-start gap-3 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={form.enabledFeatures.includes(feature)}
                      onChange={(event) =>
                        setFormOverride({
                          ...form,
                          enabledFeatures: event.target.checked
                            ? [...form.enabledFeatures, feature]
                            : form.enabledFeatures.filter(
                                (item) => item !== feature,
                              ),
                        })
                      }
                      className="mt-1 accent-[var(--app-primary)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-[var(--app-text)]">
                        {featureLabels[feature].title}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--app-text-muted)]">
                        {featureLabels[feature].description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <section className={`${surface} p-5`}>
              <h2 className="font-semibold text-[var(--app-text)]">
                Legal links
              </h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Optional links to the business&apos;s own terms and privacy
                pages.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(
                  [
                    ["termsUrl", "Terms of service"],
                    ["privacyUrl", "Privacy policy"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="text-sm font-medium text-[var(--app-text)]"
                  >
                    {label}
                    <input
                      type="url"
                      value={form[key] ?? ""}
                      onChange={(event) =>
                        setFormOverride({
                          ...form,
                          [key]: event.target.value || null,
                        })
                      }
                      placeholder="https://example.com/…"
                      className="mt-2 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm font-normal text-[var(--app-text)]"
                    />
                  </label>
                ))}
              </div>
            </section>
            <div>
              <button
                type="button"
                className={primaryButton}
                disabled={
                  save.isPending ||
                  form.inviteExpiryHours < 24 ||
                  form.inviteExpiryHours > 720
                }
                onClick={() => save.mutate(form)}
              >
                {save.isPending ? "Saving…" : "Save portal settings"}
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

export function CustomerPortalAdminView() {
  const pathname = usePathname();
  const section = pathname.includes("home-builder")
    ? "builder"
    : pathname.endsWith("/accounts")
      ? "accounts"
      : pathname.endsWith("/settings")
        ? "settings"
        : "overview";
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-8">
      {section === "overview" && <OverviewPanel />}
      {section === "builder" && <HomeBuilderPanel />}
      {section === "accounts" && <AccountsPanel />}
      {section === "settings" && <SettingsPanel />}
    </main>
  );
}
