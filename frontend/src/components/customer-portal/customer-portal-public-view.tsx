"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleHelp,
  CreditCard,
  LogOut,
  Package,
  ShieldCheck,
  Stamp,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelPortalBooking,
  createPortalBooking,
  createPortalReorderDraft,
  downloadPortalReceipt,
  fetchPortalBilling,
  fetchPortalBookingServices,
  fetchPortalBookingSlots,
  fetchPortalBookings,
  fetchPortalBootstrap,
  fetchPortalHome,
  fetchPortalLoyalty,
  fetchPortalMe,
  fetchPortalOrders,
  fetchPortalReturns,
  fetchPortalSupport,
  joinPortalQueue,
  joinPortalWaitlist,
  portalAcceptInvite,
  portalLogin,
  portalLogout,
  redeemPortalLoyaltyReward,
  cancelPortalMembership,
  requestPortalDataExport,
  requestPortalReturn,
  respondPortalQuote,
  reschedulePortalBooking,
  updatePortalProfile,
  updatePortalCommerceSubscription,
  type CustomerPortalCard,
  type CustomerPortalCursorParams,
  type CustomerPortalFeature,
  type CustomerPortalPageInfo,
} from "@/lib/customer-portal-api";

type PortalScreen =
  | "home"
  | "account"
  | "orders"
  | "bookings"
  | "billing"
  | "returns"
  | "support"
  | "loyalty"
  | "login"
  | "accept";

function uniquePortalRows<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function nextPortalCursors(pagination: Record<string, CustomerPortalPageInfo>) {
  const cursors: CustomerPortalCursorParams = {};
  for (const [collection, page] of Object.entries(pagination)) {
    if (page.hasMore && page.nextCursor) {
      cursors[`${collection}Cursor`] = page.nextCursor;
    }
  }
  return Object.keys(cursors).length ? cursors : undefined;
}

const screenInfo: Record<
  Exclude<PortalScreen, "login" | "accept">,
  { title: string; feature?: CustomerPortalFeature; icon: typeof Package }
> = {
  home: { title: "Overview", icon: ShieldCheck },
  account: { title: "My account", feature: "account", icon: UserCircle },
  orders: { title: "Orders & tracking", feature: "orders", icon: Package },
  bookings: {
    title: "Bookings & queue",
    feature: "bookings",
    icon: CalendarDays,
  },
  billing: { title: "Quotes & payments", feature: "billing", icon: CreditCard },
  returns: { title: "Returns & warranty", feature: "returns", icon: ArrowLeft },
  support: {
    title: "Support & messages",
    feature: "support",
    icon: CircleHelp,
  },
  loyalty: { title: "Loyalty & memberships", feature: "loyalty", icon: Stamp },
};

const card =
  "rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const input =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 text-sm text-[var(--app-text)] outline-none focus:border-[var(--app-primary)]";

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-4 text-sm text-[var(--app-danger)]"
    >
      {message}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${card} p-7 text-center text-sm text-[var(--app-text-muted)]`}
    >
      {children}
    </div>
  );
}

function formatMoney(value: number | string, currency: string, locale: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not available";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function LoginForm({
  slug,
  initialInviteToken,
  onSession,
}: {
  slug: string;
  initialInviteToken?: string;
  onSession: (token: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const accepting = Boolean(initialInviteToken);
  const login = useMutation({
    mutationFn: () => portalLogin(slug, email, password),
    onSuccess: (result) => onSession(result.accessToken),
    onError: (error) => toast.error(error.message),
  });
  const accept = useMutation({
    mutationFn: () =>
      portalAcceptInvite(slug, initialInviteToken ?? "", invitePassword),
    onSuccess: (result) => onSession(result.accessToken),
    onError: (error) => toast.error(error.message),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (accepting) accept.mutate();
    else login.mutate();
  }
  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-md items-center p-5">
      <form onSubmit={submit} className={`${card} w-full p-7`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
          Customer Portal
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)]">
          {accepting ? "Set up your account" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-[var(--app-text-muted)]">
          {accepting
            ? "Choose a password to activate the one-time invitation."
            : `Secure access to your records at ${slug}.`}
        </p>
        {accepting && !initialInviteToken ? (
          <ErrorBox message="Invite token missing. Ask the business for a new invite." />
        ) : (
          <>
            {!accepting && (
              <label className="mt-6 block text-sm font-medium text-[var(--app-text)]">
                Email address
                <input
                  className={`${input} mt-2`}
                  autoComplete="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}
            <label className="mt-5 block text-sm font-medium text-[var(--app-text)]">
              {accepting ? "Create password" : "Password"}
              <input
                className={`${input} mt-2`}
                autoComplete={accepting ? "new-password" : "current-password"}
                type="password"
                minLength={12}
                maxLength={128}
                required
                value={accepting ? invitePassword : password}
                onChange={(event) =>
                  accepting
                    ? setInvitePassword(event.target.value)
                    : setPassword(event.target.value)
                }
              />
              <span className="mt-1 block text-xs text-[var(--app-text-muted)]">
                Use at least 12 characters.
              </span>
            </label>
            <button
              className={`${button} mt-6 w-full`}
              type="submit"
              disabled={login.isPending || accept.isPending}
            >
              {login.isPending || accept.isPending
                ? "Please wait…"
                : accepting
                  ? "Activate account"
                  : "Sign in"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </form>
    </main>
  );
}

function ProfileScreen({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => fetchPortalMe(token),
  });
  const [profileEdits, setProfileEdits] = useState<
    Partial<{ name: string; address: string; consentMarketing: boolean }>
  >({});
  const profile = {
    name: query.data?.customer.name ?? "",
    address: query.data?.customer.address ?? "",
    consentMarketing: query.data?.customer.consentMarketing ?? false,
    ...profileEdits,
  };
  const save = useMutation({
    mutationFn: () => updatePortalProfile(token, profile),
    onSuccess: async () => {
      setProfileEdits({});
      toast.success("Account updated");
      await queryClient.invalidateQueries({ queryKey: ["portal", "me"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const dataExport = useMutation({
    mutationFn: () => requestPortalDataExport(token),
    onSuccess: async (result) => {
      toast.success(
        result.reusedOpenRequest
          ? "Your open data request is already being processed"
          : "Your data export request was sent to the business",
      );
      await queryClient.invalidateQueries({ queryKey: ["portal", "me"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Empty>Loading account…</Empty>;
  if (query.isError || !query.data)
    return (
      <ErrorBox message={query.error?.message ?? "Account is not available."} />
    );
  const pendingExport = query.data.dataRequests.find(
    (request) =>
      request.status === "pending" || request.status === "in_progress",
  );
  return (
    <div className="flex flex-col gap-5">
      <section className={`${card} p-5 md:p-7`}>
        <h2 className="text-lg font-semibold text-[var(--app-text)]">
          Profile details
        </h2>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          Name, address and consent update your canonical business customer
          record.
        </p>
        <form
          className="mt-5 grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <label className="text-sm font-medium text-[var(--app-text)]">
            Name
            <input
              className={`${input} mt-2`}
              required
              value={profile.name}
              onChange={(event) =>
                setProfileEdits({ ...profileEdits, name: event.target.value })
              }
            />
          </label>
          <label className="text-sm font-medium text-[var(--app-text)]">
            Address
            <input
              className={`${input} mt-2`}
              value={profile.address}
              onChange={(event) =>
                setProfileEdits({
                  ...profileEdits,
                  address: event.target.value,
                })
              }
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-[var(--app-text)] md:col-span-2">
            <input
              type="checkbox"
              checked={profile.consentMarketing}
              onChange={(event) =>
                setProfileEdits({
                  ...profileEdits,
                  consentMarketing: event.target.checked,
                })
              }
              className="mt-1 accent-[var(--app-primary)]"
            />
            <span>
              <span className="font-medium">
                I agree to receive marketing updates
              </span>
              <span className="mt-1 block text-xs text-[var(--app-text-muted)]">
                This updates the marketing consent recorded on your customer
                profile. You can change it here later.
              </span>
            </span>
          </label>
          <div className="md:col-span-2">
            <button type="submit" className={button} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save account"}
            </button>
          </div>
        </form>
        <div className="mt-6 rounded-lg bg-[var(--app-surface-muted)] p-4">
          <h3 className="text-sm font-semibold text-[var(--app-text)]">
            Contact details
          </h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--app-text-muted)]">Email</dt>
              <dd className="mt-1 break-all text-[var(--app-text)]">
                {query.data.customer.email ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--app-text-muted)]">Phone</dt>
              <dd className="mt-1 text-[var(--app-text)]">
                {query.data.customer.phone || "Not provided"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-[var(--app-text-muted)]">
            Contact changes are locked until email or phone verification is
            configured. Ask the business to update these details for now.
          </p>
        </div>
        <p className="mt-4 text-xs text-[var(--app-text-muted)]">
          Birthday and preferred language are not editable in this portal yet.
        </p>
      </section>
      <section className={`${card} p-5 md:p-7`}>
        <h2 className="text-lg font-semibold text-[var(--app-text)]">
          Download my data
        </h2>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          Request a copy of the customer data the business holds. The business
          processes this through its existing privacy-request workflow.
        </p>
        <button
          type="button"
          className={`${button} mt-4`}
          disabled={dataExport.isPending || Boolean(pendingExport)}
          onClick={() => dataExport.mutate()}
        >
          {dataExport.isPending
            ? "Submitting…"
            : pendingExport
              ? "Request in progress"
              : "Request data export"}
        </button>
        {query.data.dataRequests.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--app-border)]">
            {query.data.dataRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <span className="capitalize text-[var(--app-text)]">
                  {request.status.replaceAll("_", " ")} · requested{" "}
                  {new Date(request.createdAt).toLocaleDateString()}
                </span>
                {request.status === "fulfilled" && request.resultUrl && (
                  <a
                    className="font-semibold text-[var(--app-primary)] hover:underline"
                    href={request.resultUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download export
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {!query.data.dataRequests.length && (
          <p className="mt-4 text-xs text-[var(--app-text-muted)]">
            No data export request has been submitted.
          </p>
        )}
      </section>
    </div>
  );
}

function OrdersScreen({
  token,
  currency,
  locale,
}: {
  token: string;
  currency: string;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["portal", "orders"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPortalOrders(token, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const reorder = useMutation({
    mutationFn: (orderId: string) => createPortalReorderDraft(token, orderId),
    onSuccess: async (draft) => {
      toast.success(`Draft order #${draft.orderNo} sent to the business`);
      await queryClient.invalidateQueries({ queryKey: ["portal", "orders"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Empty>Loading orders…</Empty>;
  if (query.isError) return <ErrorBox message={query.error.message} />;
  const orders = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (!orders.length)
    return <Empty>No orders or quotes are recorded for this account.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <article key={order.id} className={`${card} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">
                {order.isQuotation ? "Quote" : "Order"} #{order.orderNo}
              </h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                {new Date(order.createdAt).toLocaleString(locale)} ·{" "}
                {order.status.replaceAll("_", " ")}
                {order.quotationStatus ? ` · ${order.quotationStatus}` : ""}
                {!order.isQuotation ? ` · payment ${order.paymentStatus}` : ""}
              </p>
            </div>
            <span className="text-lg font-bold tabular-nums text-[var(--app-text)]">
              {formatMoney(order.total, currency, locale)}
            </span>
          </div>
          <ul className="mt-4 divide-y divide-[var(--app-border)]">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-2 py-2 text-sm"
              >
                <span className="text-[var(--app-text)]">
                  {item.name} × {item.qty}
                </span>
                <span className="text-[var(--app-text-muted)]">
                  {formatMoney(item.price, currency, locale)}
                </span>
              </li>
            ))}
          </ul>
          {order.delivery && (
            <section className="mt-4 rounded-lg bg-[var(--app-surface-muted)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                    Delivery
                  </p>
                  <p className="mt-1 text-sm font-semibold capitalize text-[var(--app-text)]">
                    {order.delivery.status.replaceAll("_", " ")}
                  </p>
                  {order.delivery.promisedAt && (
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      Promised by{" "}
                      {new Date(order.delivery.promisedAt).toLocaleString(
                        locale,
                      )}
                    </p>
                  )}
                  {order.delivery.deliveredAt && (
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      Delivered{" "}
                      {new Date(order.delivery.deliveredAt).toLocaleString(
                        locale,
                      )}
                    </p>
                  )}
                </div>
                {order.delivery.trackingToken && (
                  <Link
                    className="text-sm font-semibold text-[var(--app-primary)] hover:underline"
                    href={`/track/${encodeURIComponent(order.delivery.trackingToken)}`}
                  >
                    Track delivery
                  </Link>
                )}
              </div>
            </section>
          )}
          {!order.isQuotation && order.status !== "draft" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
                type="button"
                disabled={reorder.isPending || order.items.length === 0}
                onClick={() => reorder.mutate(order.id)}
              >
                Reorder as draft
              </button>
              <span className="text-xs text-[var(--app-text-muted)]">
                Uses current catalog prices; it does not charge you or change
                stock.
              </span>
            </div>
          )}
        </article>
      ))}
      {query.hasNextPage ? (
        <button
          className="self-center rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() =>
            void query
              .fetchNextPage()
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not load more orders.",
                ),
              )
          }
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more orders"}
        </button>
      ) : null}
    </div>
  );
}

function BookingsScreen({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    return today.toISOString().slice(0, 10);
  });
  const [startsAt, setStartsAt] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["portal", "bookings"],
    initialPageParam: undefined as CustomerPortalCursorParams | undefined,
    queryFn: ({ pageParam }) => fetchPortalBookings(token, pageParam),
    getNextPageParam: (lastPage) => nextPortalCursors(lastPage.pagination),
  });
  const services = useQuery({
    queryKey: ["portal", "booking-services"],
    queryFn: () => fetchPortalBookingServices(token),
  });
  const slots = useQuery({
    queryKey: ["portal", "booking-slots", serviceId, bookingDate],
    queryFn: () => fetchPortalBookingSlots(token, serviceId, bookingDate),
    enabled: Boolean(serviceId && bookingDate),
  });
  const createBooking = useMutation({
    mutationFn: () => createPortalBooking(token, { serviceId, startsAt }),
    onSuccess: async () => {
      toast.success("Booking requested");
      setStartsAt("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "bookings"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const joinWaitlist = useMutation({
    mutationFn: () => joinPortalWaitlist(token, serviceId),
    onSuccess: async () => {
      toast.success("You joined the waiting list");
      await queryClient.invalidateQueries({ queryKey: ["portal", "bookings"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const joinQueue = useMutation({
    mutationFn: () => joinPortalQueue(token, serviceId || undefined),
    onSuccess: async (result) => {
      toast.success(`You joined the queue as #${result.number}`);
      await queryClient.invalidateQueries({ queryKey: ["portal", "bookings"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const cancel = useMutation({
    mutationFn: (appointmentId: string) =>
      cancelPortalBooking(token, appointmentId),
    onSuccess: async () => {
      toast.success("Booking cancelled");
      await queryClient.invalidateQueries({ queryKey: ["portal", "bookings"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const reschedule = useMutation({
    mutationFn: ({ id, startsAt }: { id: string; startsAt: string }) =>
      reschedulePortalBooking(token, id, startsAt),
    onSuccess: async () => {
      toast.success("Booking rescheduled");
      await queryClient.invalidateQueries({ queryKey: ["portal", "bookings"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Empty>Loading bookings…</Empty>;
  if (query.isError) return <ErrorBox message={query.error.message} />;
  const pages = query.data?.pages ?? [];
  const items = uniquePortalRows(pages.flatMap((page) => page.appointments));
  const waitlist = uniquePortalRows(pages.flatMap((page) => page.waitlist));
  const queue = uniquePortalRows(pages.flatMap((page) => page.queue));
  return (
    <div className="flex flex-col gap-5">
      <section className={`${card} p-5`}>
        <h2 className="font-semibold text-[var(--app-text)]">Book a service</h2>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          Availability is checked against the business booking calendar when you
          submit.
        </p>
        {services.isError ? (
          <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">
            Could not load services. {services.error.message}
          </p>
        ) : (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (serviceId && startsAt) createBooking.mutate();
            }}
          >
            <label className="min-w-48 flex-1 text-xs font-medium text-[var(--app-text-muted)]">
              Service
              <select
                className={`${input} mt-1`}
                value={serviceId}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  setStartsAt("");
                }}
                required
              >
                <option value="">Choose a service</option>
                {(services.data ?? []).map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                    {service.durationMin ? ` · ${service.durationMin} min` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--app-text-muted)]">
              Date
              <input
                className={`${input} mt-1`}
                type="date"
                value={bookingDate}
                onChange={(event) => {
                  setBookingDate(event.target.value);
                  setStartsAt("");
                }}
                required
              />
            </label>
            <label className="min-w-52 text-xs font-medium text-[var(--app-text-muted)]">
              Available time
              <select
                className={`${input} mt-1`}
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                disabled={
                  !serviceId || slots.isLoading || !slots.data?.slots.length
                }
                required
              >
                <option value="">
                  {slots.isLoading
                    ? "Checking availability…"
                    : slots.data?.slots.length
                      ? "Choose a time"
                      : "No available times"}
                </option>
                {(slots.data?.slots ?? []).map((slot) => (
                  <option key={slot} value={slot}>
                    {new Date(slot).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={button}
              type="submit"
              disabled={!serviceId || !startsAt || createBooking.isPending}
            >
              {createBooking.isPending ? "Booking…" : "Book service"}
            </button>
            <button
              className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
              type="button"
              disabled={!serviceId || joinWaitlist.isPending}
              onClick={() => joinWaitlist.mutate()}
            >
              Join waiting list
            </button>
            <button
              className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
              type="button"
              disabled={joinQueue.isPending}
              onClick={() => joinQueue.mutate()}
            >
              Join walk-in queue
            </button>
          </form>
        )}
        {slots.isError && (
          <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">
            Could not check availability. {slots.error.message}
          </p>
        )}
        {!services.isLoading && !services.isError && !services.data?.length && (
          <p className="mt-3 text-sm text-[var(--app-text-muted)]">
            No bookable services are currently published.
          </p>
        )}
      </section>
      {items.length ? (
        items.map((appointment) => (
          <article key={appointment.id} className={`${card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[var(--app-text)]">
                  {appointment.service.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  {new Date(appointment.startsAt).toLocaleString()} ·{" "}
                  {appointment.status.replaceAll("_", " ")}
                </p>
              </div>
              {appointment.status === "booked" && (
                <button
                  className="text-sm font-medium text-[var(--app-danger)] hover:underline"
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(appointment.id)}
                >
                  Cancel booking
                </button>
              )}
            </div>
            {appointment.status === "booked" && (
              <form
                className="mt-4 flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get(
                    "startsAt",
                  );
                  if (typeof value === "string" && value)
                    reschedule.mutate({
                      id: appointment.id,
                      startsAt: new Date(value).toISOString(),
                    });
                }}
              >
                <label className="text-xs font-medium text-[var(--app-text-muted)]">
                  Reschedule to
                  <input
                    name="startsAt"
                    className={`${input} mt-1`}
                    type="datetime-local"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--app-border)] px-3 py-2.5 text-sm font-medium text-[var(--app-text)]"
                  disabled={reschedule.isPending}
                >
                  Choose time
                </button>
              </form>
            )}
          </article>
        ))
      ) : (
        <Empty>No appointments are recorded.</Empty>
      )}
      {waitlist.length ? (
        <section className={`${card} p-5`}>
          <h2 className="font-semibold text-[var(--app-text)]">Waiting list</h2>
          <ul className="mt-3 divide-y divide-[var(--app-border)]">
            {waitlist.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <span className="font-medium text-[var(--app-text)]">
                  {item.service.name}
                </span>
                <span className="ml-2 capitalize text-[var(--app-text-muted)]">
                  {item.status}
                </span>
                {item.offeredStartsAt && (
                  <span className="ml-2 text-[var(--app-text-muted)]">
                    Offer: {new Date(item.offeredStartsAt).toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {queue.length ? (
        <section className={`${card} p-5`}>
          <h2 className="font-semibold text-[var(--app-text)]">Queue tokens</h2>
          <ul className="mt-3 divide-y divide-[var(--app-border)]">
            {queue.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-2 py-3 text-sm"
              >
                <span className="text-[var(--app-text)]">
                  #{item.number}
                  {item.service ? ` · ${item.service.name}` : ""}
                </span>
                <span className="capitalize text-[var(--app-text-muted)]">
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {query.hasNextPage ? (
        <button
          className="self-center rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() =>
            void query
              .fetchNextPage()
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not load more booking records.",
                ),
              )
          }
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more booking records"}
        </button>
      ) : null}
    </div>
  );
}

function BillingScreen({
  token,
  currency,
  locale,
}: {
  token: string;
  currency: string;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [receiptLinks, setReceiptLinks] = useState<Record<string, string>>({});
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>(
    {},
  );
  const receipt = useMutation({
    mutationFn: (orderId: string) => downloadPortalReceipt(token, orderId),
    onSuccess: (result, orderId) => {
      setReceiptLinks((links) => ({ ...links, [orderId]: result.url }));
      toast.success("Receipt is ready to download");
    },
    onError: (error) => toast.error(error.message),
  });
  const query = useInfiniteQuery({
    queryKey: ["portal", "billing"],
    initialPageParam: undefined as CustomerPortalCursorParams | undefined,
    queryFn: ({ pageParam }) => fetchPortalBilling(token, pageParam),
    getNextPageParam: (lastPage) => nextPortalCursors(lastPage.pagination),
  });
  const respond = useMutation({
    mutationFn: (input: {
      quoteId: string;
      response: "accept" | "decline";
      reason?: string;
    }) =>
      respondPortalQuote(token, input.quoteId, {
        response: input.response,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    onSuccess: async (result) => {
      toast.success(`Quote #${result.orderNo} ${result.quotationStatus}`);
      await queryClient.invalidateQueries({ queryKey: ["portal", "billing"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Empty>Loading billing records…</Empty>;
  if (query.isError) return <ErrorBox message={query.error.message} />;
  if (!query.data) return null;
  const billingPages = query.data.pages;
  const billing = billingPages[0];
  const quotes = uniquePortalRows(billingPages.flatMap((page) => page.quotes));
  const ordersAndReceipts = uniquePortalRows(
    billingPages.flatMap((page) => page.ordersAndReceipts),
  );
  return (
    <div className="flex flex-col gap-5">
      <section
        className={`${card} border-[var(--app-warning-border)] p-4 text-sm text-[var(--app-warning-text)]`}
      >
        {billing.onlineInvoicePayment.reason}
      </section>
      <p className="text-sm text-[var(--app-text-muted)]">{billing.note}</p>
      {quotes.length ? (
        <section className={`${card} overflow-hidden`}>
          <h2 className="border-b border-[var(--app-border)] p-5 font-semibold text-[var(--app-text)]">
            Quotes
          </h2>
          <ul className="divide-y divide-[var(--app-border)]">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-wrap justify-between gap-3 p-5 text-sm"
              >
                <span className="text-[var(--app-text)]">
                  Quote #{quote.orderNo} ·{" "}
                  {quote.quotationStatus ?? quote.status}
                </span>
                <span className="font-semibold tabular-nums text-[var(--app-text)]">
                  {formatMoney(quote.total, currency, locale)}
                </span>
                {quote.quotationStatus === "sent" && (
                  <div className="w-full border-t border-[var(--app-border)] pt-3">
                    <p className="text-xs text-[var(--app-text-muted)]">
                      Accepting records your response only. It does not charge
                      you or place an order.
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <button
                        className={button}
                        type="button"
                        disabled={respond.isPending}
                        onClick={() =>
                          respond.mutate({
                            quoteId: quote.id,
                            response: "accept",
                          })
                        }
                      >
                        Accept quote
                      </button>
                      <form
                        className="flex min-w-64 flex-1 flex-wrap items-end gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const reason = declineReasons[quote.id]?.trim();
                          if (reason)
                            respond.mutate({
                              quoteId: quote.id,
                              response: "decline",
                              reason,
                            });
                        }}
                      >
                        <label className="min-w-48 flex-1 text-xs font-medium text-[var(--app-text-muted)]">
                          Decline reason
                          <input
                            className={`${input} mt-1`}
                            value={declineReasons[quote.id] ?? ""}
                            maxLength={500}
                            onChange={(event) =>
                              setDeclineReasons((current) => ({
                                ...current,
                                [quote.id]: event.target.value,
                              }))
                            }
                            required
                          />
                        </label>
                        <button
                          className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
                          type="submit"
                          disabled={
                            respond.isPending ||
                            !declineReasons[quote.id]?.trim()
                          }
                        >
                          Decline quote
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty>No quotes are recorded.</Empty>
      )}
      {ordersAndReceipts.length ? (
        <section className={`${card} overflow-hidden`}>
          <h2 className="border-b border-[var(--app-border)] p-5 font-semibold text-[var(--app-text)]">
            Orders & recorded payments
          </h2>
          <ul className="divide-y divide-[var(--app-border)]">
            {ordersAndReceipts.map((order) => (
              <li key={order.id} className="p-5">
                <div className="flex flex-wrap justify-between gap-3 text-sm">
                  <div>
                    <span className="text-[var(--app-text)]">
                      Order #{order.orderNo} · {order.status}
                    </span>
                    <p className="mt-1 text-xs capitalize text-[var(--app-text-muted)]">
                      Payment {order.paymentStatus} · recorded paid{" "}
                      {formatMoney(order.amountPaid, currency, locale)}
                      {order.amountDue !== null
                        ? ` · balance ${formatMoney(order.amountDue, currency, locale)}`
                        : " · balance not shown after refund"}
                    </p>
                  </div>
                  <span className="font-semibold text-[var(--app-text)]">
                    {formatMoney(order.total, currency, locale)}
                  </span>
                </div>
                {order.payments.length ? (
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    {order.payments
                      .map(
                        (payment) =>
                          `${formatMoney(payment.amount, currency, locale)} · ${payment.method}`,
                      )
                      .join(" · ")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                    No payment is recorded for this order.
                  </p>
                )}
                <div className="mt-3">
                  {receiptLinks[order.id] ? (
                    <a
                      className="text-sm font-semibold text-[var(--app-primary)] hover:underline"
                      href={receiptLinks[order.id]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download receipt PDF
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="text-sm font-semibold text-[var(--app-primary)] hover:underline disabled:opacity-50"
                      disabled={receipt.isPending}
                      onClick={() => receipt.mutate(order.id)}
                    >
                      {receipt.isPending
                        ? "Preparing receipt…"
                        : "Prepare receipt PDF"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty>No order receipts are recorded.</Empty>
      )}
      {query.hasNextPage ? (
        <button
          className="self-center rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() =>
            void query
              .fetchNextPage()
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not load more billing records.",
                ),
              )
          }
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more billing records"}
        </button>
      ) : null}
    </div>
  );
}

function ReturnsScreen({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["portal", "returns"],
    initialPageParam: undefined as CustomerPortalCursorParams | undefined,
    queryFn: ({ pageParam }) => fetchPortalReturns(token, pageParam),
    getNextPageParam: (lastPage) => nextPortalCursors(lastPage.pagination),
  });
  const [orderId, setOrderId] = useState("");
  const [productId, setProductId] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("cash");
  const returnPages = query.data?.pages ?? [];
  const returns = uniquePortalRows(returnPages.flatMap((page) => page.returns));
  const eligibleOrders = uniquePortalRows(
    returnPages.flatMap((page) => page.eligibleOrders),
  );
  const currentOrder = eligibleOrders.find((order) => order.id === orderId);
  const returnMutation = useMutation({
    mutationFn: () =>
      requestPortalReturn(token, {
        orderId,
        reason,
        refundMethod: method,
        items: [{ productId, qty: 1 }],
      }),
    onSuccess: async () => {
      toast.success("Return request sent for business review");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "returns"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Empty>Loading return records…</Empty>;
  if (query.isError) return <ErrorBox message={query.error.message} />;
  if (!query.data) return null;
  const returnMetadata = query.data.pages[0];
  return (
    <div className="flex flex-col gap-5">
      <section className={`${card} p-5`}>
        <h2 className="font-semibold text-[var(--app-text)]">
          Request a return
        </h2>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          The system checks item quantities against prior requests and
          calculates the amount from the original order. The business reviews
          the request before any refund or stock change.
        </p>
        {eligibleOrders.length ? (
          <form
            className="mt-5 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              returnMutation.mutate();
            }}
          >
            <label className="text-sm font-medium text-[var(--app-text)]">
              Order
              <select
                className={`${input} mt-2`}
                required
                value={orderId}
                onChange={(event) => {
                  setOrderId(event.target.value);
                  setProductId("");
                }}
              >
                <option value="">Choose an order</option>
                {eligibleOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.orderNo} ·{" "}
                    {new Date(order.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--app-text)]">
              Item
              <select
                className={`${input} mt-2`}
                required
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
              >
                <option value="">Choose an item</option>
                {currentOrder?.items
                  .filter((item) => item.productId)
                  .map((item) => (
                    <option key={item.productId} value={item.productId!}>
                      {item.name} · qty {item.qty}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--app-text)]">
              Reason
              <input
                className={`${input} mt-2`}
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-[var(--app-text)]">
              Requested refund method
              <select
                className={`${input} mt-2`}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online">Online</option>
                <option value="credit">Credit</option>
                <option value="store_credit">Store credit</option>
              </select>
            </label>
            <button
              className={`${button} md:col-span-2 md:justify-self-start`}
              type="submit"
              disabled={returnMutation.isPending || !orderId || !productId}
            >
              {returnMutation.isPending ? "Sending…" : "Submit request"}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[var(--app-text-muted)]">
            No orders with returnable product lines are recorded.
          </p>
        )}
      </section>
      <section className={`${card} p-5`}>
        <h2 className="font-semibold text-[var(--app-text)]">Warranty</h2>
        <p className="mt-2 text-sm text-[var(--app-text-muted)]">
          {returnMetadata.warranty.reason}
        </p>
      </section>
      <section className={`${card} overflow-hidden`}>
        <h2 className="border-b border-[var(--app-border)] p-5 font-semibold text-[var(--app-text)]">
          Your return requests
        </h2>
        {returns.length ? (
          <ul className="divide-y divide-[var(--app-border)]">
            {returns.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap justify-between gap-2 p-5 text-sm"
              >
                <span className="text-[var(--app-text)]">
                  Order #{item.order.orderNo} · {item.reason} ·{" "}
                  <span className="capitalize">{item.status}</span>
                </span>
                <span className="font-semibold text-[var(--app-text)]">
                  {item.refundAmount}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-[var(--app-text-muted)]">
            No return requests yet.
          </p>
        )}
      </section>
      {query.hasNextPage ? (
        <button
          className="self-center rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() =>
            void query
              .fetchNextPage()
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not load more return records.",
                ),
              )
          }
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more return records"}
        </button>
      ) : null}
    </div>
  );
}

function LoyaltyScreen({
  token,
  currency,
  locale,
}: {
  token: string;
  currency: string;
  locale: string;
}) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["portal", "loyalty"],
    initialPageParam: undefined as CustomerPortalCursorParams | undefined,
    queryFn: ({ pageParam }) => fetchPortalLoyalty(token, pageParam),
    getNextPageParam: (lastPage) => nextPortalCursors(lastPage.pagination),
  });
  const [redeemMemberId, setRedeemMemberId] = useState<string | null>(null);
  const [membershipCancelId, setMembershipCancelId] = useState<string | null>(
    null,
  );
  const [membershipReason, setMembershipReason] = useState("");
  const [subscriptionAction, setSubscriptionAction] = useState<{
    id: string;
    action: "pause" | "resume" | "cancel" | "skip_next" | "keep_next";
  } | null>(null);
  const [subscriptionReason, setSubscriptionReason] = useState("");
  const redeemMutation = useMutation({
    mutationFn: (memberId: string) =>
      redeemPortalLoyaltyReward(token, memberId),
    onSuccess: async () => {
      toast.success("Reward redeemed");
      setRedeemMemberId(null);
      await queryClient.invalidateQueries({ queryKey: ["portal", "loyalty"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const subscriptionMutation = useMutation({
    mutationFn: (variables: {
      id: string;
      action: "pause" | "resume" | "cancel" | "skip_next" | "keep_next";
      reason?: string;
    }) =>
      updatePortalCommerceSubscription(
        token,
        variables.id,
        variables.action,
        variables.reason,
      ),
    onSuccess: async () => {
      toast.success("Subscription updated");
      setSubscriptionAction(null);
      setSubscriptionReason("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "loyalty"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const membershipMutation = useMutation({
    mutationFn: (variables: { id: string; reason: string }) =>
      cancelPortalMembership(token, variables.id, variables.reason),
    onSuccess: async () => {
      toast.success("Membership cancelled");
      setMembershipCancelId(null);
      setMembershipReason("");
      await queryClient.invalidateQueries({ queryKey: ["portal", "loyalty"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Empty>Loading membership records…</Empty>;
  if (query.isError) return <ErrorBox message={query.error.message} />;
  if (!query.data) return null;
  const loyaltyPages = query.data.pages;
  const loyalty = uniquePortalRows(
    loyaltyPages.flatMap((page) => page.loyalty),
  );
  const memberships = uniquePortalRows(
    loyaltyPages.flatMap((page) => page.memberships),
  );
  const subscriptions = uniquePortalRows(
    loyaltyPages.flatMap((page) => page.subscriptions),
  );
  const preorders = uniquePortalRows(
    loyaltyPages.flatMap((page) => page.preorders),
  );
  const hasRecords =
    loyalty.length ||
    memberships.length ||
    subscriptions.length ||
    preorders.length;
  return (
    <div className="flex flex-col gap-5">
      {loyalty.map((item) => (
        <section key={item.id} className={`${card} p-5`}>
          <h2 className="font-semibold text-[var(--app-text)]">
            {item.program.name}
          </h2>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            {item.program.type === "punch_card"
              ? `${item.stampCount} stamps · ${item.program.stampsRequired} required`
              : `${item.currentTier ?? "No tier threshold met"} · ${item.redeemedCount} rewards redeemed`}
          </p>
          {item.program.rewardDescription && (
            <p className="mt-2 text-sm text-[var(--app-text)]">
              {item.program.rewardDescription}
            </p>
          )}
          {item.program.type === "punch_card" && item.program.active && (
            <div className="mt-4">
              {item.stampCount >= item.program.stampsRequired ? (
                redeemMemberId === item.id ? (
                  <div
                    role="group"
                    aria-label={`Confirm ${item.program.name} reward redemption`}
                    className="rounded-lg border border-[var(--app-border)] p-4"
                  >
                    <p className="m-0 text-sm text-[var(--app-text)]">
                      Redeeming will use {item.program.stampsRequired} stamps
                      from this reward balance.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={button}
                        disabled={redeemMutation.isPending}
                        onClick={() => redeemMutation.mutate(item.id)}
                      >
                        Confirm redemption
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]"
                        onClick={() => setRedeemMemberId(null)}
                      >
                        Keep stamps
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={button}
                    onClick={() => setRedeemMemberId(item.id)}
                  >
                    Redeem reward
                  </button>
                )
              ) : null}
            </div>
          )}
          {!item.program.active && (
            <p className="mb-0 mt-3 text-sm text-[var(--app-text-muted)]">
              This loyalty program is inactive; rewards cannot be redeemed.
            </p>
          )}
        </section>
      ))}
      {memberships.map((item) => (
        <section key={item.id} className={`${card} p-5`}>
          <h2 className="font-semibold text-[var(--app-text)]">
            Membership · {item.plan.name}
          </h2>
          <p className="mt-2 text-sm capitalize text-[var(--app-text-muted)]">
            {item.status} · {formatMoney(item.plan.price, currency, locale)} /{" "}
            {item.plan.interval}
            {item.currentPeriodEnd
              ? ` · through ${new Date(item.currentPeriodEnd).toLocaleDateString(locale)}`
              : ""}
          </p>
          {membershipCancelId === item.id ? (
            <form
              className="mt-4 rounded-lg border border-[var(--app-border)] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                membershipMutation.mutate({
                  id: item.id,
                  reason: membershipReason,
                });
              }}
            >
              <p className="m-0 text-sm text-[var(--app-text)]">
                This ends the membership. Online memberships may also cancel
                future provider renewals. Enter a reason to continue.
              </p>
              <label className="mt-3 block text-sm font-medium text-[var(--app-text)]">
                Reason
                <input
                  className={`${input} mt-2`}
                  minLength={3}
                  maxLength={500}
                  required
                  value={membershipReason}
                  onChange={(event) => setMembershipReason(event.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--app-danger)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={membershipMutation.isPending}
                >
                  Confirm cancellation
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]"
                  onClick={() => {
                    setMembershipCancelId(null);
                    setMembershipReason("");
                  }}
                >
                  Keep membership
                </button>
              </div>
            </form>
          ) : !["cancelled", "expired"].includes(item.status) ? (
            <button
              type="button"
              className="mt-4 rounded-lg border border-[var(--app-danger-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-danger)]"
              onClick={() => setMembershipCancelId(item.id)}
            >
              Cancel membership
            </button>
          ) : null}
        </section>
      ))}
      {subscriptions.map((item) => (
        <section key={item.id} className={`${card} p-5`}>
          <h2 className="font-semibold text-[var(--app-text)]">
            Subscription · {item.plan.name}
          </h2>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            {item.plan.product.name} · next renewal{" "}
            {new Date(item.nextRenewalAt).toLocaleDateString(locale)} ·{" "}
            {item.status} ·{" "}
            {formatMoney(
              Number(item.plan.pricePerUnit ?? item.plan.product.sellingPrice) *
                item.plan.qtyPerCycle,
              currency,
              locale,
            )}{" "}
            per cycle
            {item.skipNextCycle ? " · next cycle skipped" : ""}
          </p>
          {subscriptionAction?.id === item.id ? (
            <div
              role="group"
              aria-label="Confirm subscription change"
              className="mt-4 rounded-lg border border-[var(--app-border)] p-4"
            >
              <p className="m-0 text-sm text-[var(--app-text)]">
                {subscriptionAction.action === "cancel"
                  ? "Cancelling stops future subscription renewals. This cannot be undone here."
                  : subscriptionAction.action === "pause"
                    ? "Pausing stops renewals until you resume the subscription."
                    : subscriptionAction.action === "skip_next"
                      ? "The next renewal will be skipped; later cycles remain scheduled."
                      : "The scheduled renewal will be restored."}
              </p>
              {subscriptionAction.action === "cancel" && (
                <label className="mt-3 block text-sm font-medium text-[var(--app-text)]">
                  Reason
                  <input
                    className={`${input} mt-2`}
                    minLength={3}
                    maxLength={500}
                    required
                    value={subscriptionReason}
                    onChange={(event) =>
                      setSubscriptionReason(event.target.value)
                    }
                  />
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={
                    subscriptionAction.action === "cancel"
                      ? "inline-flex items-center justify-center rounded-lg bg-[var(--app-danger)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      : button
                  }
                  disabled={
                    subscriptionMutation.isPending ||
                    (subscriptionAction.action === "cancel" &&
                      subscriptionReason.trim().length < 3)
                  }
                  onClick={() =>
                    subscriptionMutation.mutate({
                      id: item.id,
                      action: subscriptionAction.action,
                      ...(subscriptionAction.action === "cancel"
                        ? { reason: subscriptionReason }
                        : {}),
                    })
                  }
                >
                  Confirm {subscriptionAction.action.replace("_", " ")}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]"
                  onClick={() => {
                    setSubscriptionAction(null);
                    setSubscriptionReason("");
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          ) : item.status !== "cancelled" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.status === "active" ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]"
                    onClick={() =>
                      setSubscriptionAction({ id: item.id, action: "pause" })
                    }
                  >
                    Pause
                  </button>
                  {item.plan.allowSkip && (
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]"
                      onClick={() =>
                        setSubscriptionAction({
                          id: item.id,
                          action: item.skipNextCycle
                            ? "keep_next"
                            : "skip_next",
                        })
                      }
                    >
                      {item.skipNextCycle
                        ? "Restore next renewal"
                        : "Skip next renewal"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--app-danger-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-danger)]"
                    onClick={() =>
                      setSubscriptionAction({ id: item.id, action: "cancel" })
                    }
                  >
                    Cancel
                  </button>
                </>
              ) : item.status === "paused" ? (
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    subscriptionMutation.mutate({
                      id: item.id,
                      action: "resume",
                    })
                  }
                  disabled={subscriptionMutation.isPending}
                >
                  Resume
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ))}
      {preorders.map((item) => (
        <section key={item.id} className={`${card} p-5`}>
          <h2 className="font-semibold text-[var(--app-text)]">
            Pre-order · {item.campaign.product.name}
          </h2>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            Quantity {item.qty} · promised{" "}
            {new Date(item.promisedDate).toLocaleDateString()} · {item.status}
          </p>
        </section>
      ))}
      {!hasRecords && (
        <Empty>
          No loyalty, membership, subscription or pre-order records are linked
          to this account.
        </Empty>
      )}
      {query.hasNextPage ? (
        <button
          className="self-center rounded-lg border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)] disabled:opacity-50"
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() =>
            void query
              .fetchNextPage()
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not load more loyalty records.",
                ),
              )
          }
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more loyalty records"}
        </button>
      ) : null}
    </div>
  );
}

function DataScreen({
  screen,
  token,
  businessSlug,
  currency,
  locale,
}: {
  screen: Exclude<PortalScreen, "login" | "accept">;
  token: string;
  businessSlug: string;
  currency: string;
  locale: string;
}) {
  const home = useQuery({
    queryKey: ["portal", "home"],
    queryFn: () => fetchPortalHome(token),
    enabled: screen === "home",
  });
  const support = useQuery({
    queryKey: ["portal", "support"],
    queryFn: () => fetchPortalSupport(token),
    enabled: screen === "support",
  });
  if (screen === "account") return <ProfileScreen token={token} />;
  if (screen === "orders")
    return <OrdersScreen token={token} currency={currency} locale={locale} />;
  if (screen === "bookings") return <BookingsScreen token={token} />;
  if (screen === "billing")
    return <BillingScreen token={token} currency={currency} locale={locale} />;
  if (screen === "returns") return <ReturnsScreen token={token} />;
  if (screen === "loyalty")
    return <LoyaltyScreen token={token} currency={currency} locale={locale} />;
  if (screen === "support") {
    if (support.isLoading) return <Empty>Loading support availability…</Empty>;
    if (support.isError) return <ErrorBox message={support.error.message} />;
    return (
      <section className={`${card} flex items-start gap-3 p-5`}>
        <CircleHelp
          className="mt-0.5 h-5 w-5 text-[var(--app-text-muted)]"
          aria-hidden
        />
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">
            Support availability
          </h2>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            {support.data?.reason ?? "Not available"}
          </p>
        </div>
      </section>
    );
  }
  if (home.isLoading) return <Empty>Loading your portal…</Empty>;
  if (home.isError) return <ErrorBox message={home.error.message} />;
  if (!home.data) return null;
  const sections = home.data.layout.cards.filter((item) =>
    home.data?.enabledFeatures.includes(item),
  );
  const labelFor = (section: CustomerPortalCard) =>
    home.data?.layout.labels.find((item) => item.card === section)?.label ??
    {
      orders: "Recent orders",
      bookings: "Upcoming bookings",
      billing: "Billing activity",
      returns: "Return requests",
      loyalty: "Loyalty & memberships",
      support: "Support",
    }[section];
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl bg-[var(--app-primary)] p-6 text-white">
        <p className="text-sm opacity-80">Welcome back</p>
        <h2 className="mt-1 text-2xl font-bold">{home.data.customerName}</h2>
        <p className="mt-2 text-sm opacity-85">
          Your account with {home.data.businessName}
        </p>
      </section>
      {home.data.layout.announcements.map((announcement, index) => (
        <section
          key={`${announcement.title}-${index}`}
          className={`${card} border-[var(--app-primary)] p-5`}
        >
          <h2 className="font-semibold text-[var(--app-text)]">
            {announcement.title}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--app-text-muted)]">
            {announcement.body}
          </p>
        </section>
      ))}
      {home.data.layout.quickActions.length > 0 && (
        <section className="flex flex-wrap gap-2" aria-label="Quick actions">
          {home.data.layout.quickActions.map((action, index) => (
            <Link
              key={`${action.destination}-${index}`}
              className={button}
              href={`/portal/${businessSlug}/${action.destination}`}
            >
              {action.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ))}
        </section>
      )}
      {sections.length ? (
        <section className="grid gap-3 md:grid-cols-2">
          {sections.map((section) => {
            if (section === "orders")
              return (
                <article key={section} className={`${card} p-5`}>
                  <div className="flex items-center gap-2">
                    <Package
                      className="h-4 w-4 text-[var(--app-primary)]"
                      aria-hidden
                    />
                    <h3 className="font-semibold text-[var(--app-text)]">
                      {labelFor(section)}
                    </h3>
                  </div>
                  {home.data.orders.length ? (
                    <ul className="mt-3 divide-y divide-[var(--app-border)]">
                      {home.data.orders.slice(0, 3).map((item) => (
                        <li
                          key={item.id}
                          className="flex justify-between gap-2 py-2 text-sm"
                        >
                          <span className="text-[var(--app-text)]">
                            #{item.orderNo} · {item.status}
                          </span>
                          <span className="text-[var(--app-text-muted)]">
                            {item.total}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                      No order history recorded.
                    </p>
                  )}
                  <Link
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)]"
                    href={`/portal/${businessSlug}/orders`}
                  >
                    View orders <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </article>
              );
            if (section === "bookings")
              return (
                <article key={section} className={`${card} p-5`}>
                  <div className="flex items-center gap-2">
                    <CalendarDays
                      className="h-4 w-4 text-[var(--app-primary)]"
                      aria-hidden
                    />
                    <h3 className="font-semibold text-[var(--app-text)]">
                      {labelFor(section)}
                    </h3>
                  </div>
                  {home.data.upcomingAppointments.length ? (
                    <ul className="mt-3 divide-y divide-[var(--app-border)]">
                      {home.data.upcomingAppointments.map((item) => (
                        <li
                          key={item.id}
                          className="py-2 text-sm text-[var(--app-text)]"
                        >
                          {item.service.name} ·{" "}
                          {new Date(item.startsAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--app-text-muted)]">
                      No upcoming appointment recorded.
                    </p>
                  )}
                  <Link
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)]"
                    href={`/portal/${businessSlug}/bookings`}
                  >
                    View bookings <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </article>
              );
            if (section === "support")
              return (
                <article key={section} className={`${card} p-5`}>
                  <h3 className="font-semibold text-[var(--app-text)]">
                    {labelFor(section)}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                    {home.data.support.reason}
                  </p>
                  <Link
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)]"
                    href={`/portal/${businessSlug}/support`}
                  >
                    Support status{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </article>
              );
            return (
              <Link
                key={section}
                className={`${card} flex items-center justify-between p-5 text-sm font-semibold text-[var(--app-text)] hover:border-[var(--app-primary)]`}
                href={`/portal/${businessSlug}/${section}`}
              >
                {labelFor(section)}
                <ArrowRight
                  className="h-4 w-4 text-[var(--app-primary)]"
                  aria-hidden
                />
              </Link>
            );
          })}
        </section>
      ) : (
        <Empty>
          No home sections are visible for this customer. Contact the business
          if you think this is a mistake.
        </Empty>
      )}
      <section className={`${card} p-5`}>
        <h3 className="font-semibold text-[var(--app-text)]">
          Service availability
        </h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <p className="rounded-lg bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-text-muted)]">
            {home.data.support.reason}
          </p>
          <p className="rounded-lg bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-text-muted)]">
            {home.data.billing.reason}
          </p>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {home.data.legal.termsUrl && (
          <a
            className="text-sm text-[var(--app-primary)] hover:underline"
            href={home.data.legal.termsUrl}
            target="_blank"
            rel="noreferrer"
          >
            Terms of service
          </a>
        )}
        {home.data.legal.privacyUrl && (
          <a
            className="text-sm text-[var(--app-primary)] hover:underline"
            href={home.data.legal.privacyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
        )}
      </section>
    </div>
  );
}

export function CustomerPortalPublicView({
  businessSlug,
  screen: screenParam,
  inviteToken,
}: {
  businessSlug: string;
  screen: string;
  inviteToken?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const screen = (
    screenParam in screenInfo ||
    screenParam === "login" ||
    screenParam === "accept"
      ? screenParam
      : "home"
  ) as PortalScreen;
  const tokenKey = `noxtill-portal-session:${businessSlug}`;
  const [storedSession, setStoredSession] = useState<{
    key: string;
    token: string | null;
  }>(() => ({
    key: tokenKey,
    token:
      typeof window === "undefined"
        ? null
        : window.sessionStorage.getItem(tokenKey),
  }));
  const token = storedSession.key === tokenKey ? storedSession.token : null;
  const bootstrap = useQuery({
    queryKey: ["portal", "bootstrap", businessSlug],
    queryFn: () => fetchPortalBootstrap(businessSlug),
  });
  const logout = useMutation({
    mutationFn: () =>
      token ? portalLogout(token) : Promise.resolve({ signedOut: true }),
    onSettled: () => {
      window.sessionStorage.removeItem(tokenKey);
      setStoredSession({ key: tokenKey, token: null });
      queryClient.removeQueries({ queryKey: ["portal"] });
      router.replace(`/portal/${businessSlug}/login`);
    },
  });
  const activeScreen =
    screen === "login" || screen === "accept" ? "home" : screen;
  const info = screenInfo[activeScreen];
  const allowed = useMemo(
    () => bootstrap.data?.enabledFeatures ?? [],
    [bootstrap.data?.enabledFeatures],
  );
  if (bootstrap.isLoading)
    return (
      <main className="mx-auto max-w-4xl p-6 text-sm text-[var(--app-text-muted)]">
        Loading portal…
      </main>
    );
  if (bootstrap.isError)
    return (
      <main className="mx-auto max-w-lg p-6">
        <ErrorBox message={bootstrap.error.message} />
      </main>
    );
  if (!bootstrap.data) return null;
  if (!token || screen === "login" || screen === "accept")
    return (
      <LoginForm
        slug={businessSlug}
        initialInviteToken={screen === "accept" ? inviteToken : undefined}
        onSession={(newToken) => {
          queryClient.removeQueries({ queryKey: ["portal"] });
          window.sessionStorage.setItem(tokenKey, newToken);
          setStoredSession({ key: tokenKey, token: newToken });
          router.replace(`/portal/${businessSlug}/home`);
        }}
      />
    );
  if (info.feature && !allowed.includes(info.feature))
    return (
      <main className="mx-auto max-w-lg p-6">
        <ErrorBox message="This section is not enabled by the business." />
      </main>
    );
  const screenPaths: Exclude<PortalScreen, "login" | "accept">[] = [
    "home",
    "account",
    "orders",
    "bookings",
    "billing",
    "returns",
    "support",
    "loyalty",
  ];
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-5 md:px-8 md:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] pb-4">
        <div className="flex items-center gap-3">
          {bootstrap.data.logoUrl && (
            <Image
              src={bootstrap.data.logoUrl}
              alt={`${bootstrap.data.business.name} logo`}
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-lg border border-[var(--app-border)] object-contain"
            />
          )}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em]"
              style={
                bootstrap.data.brandColor
                  ? { color: bootstrap.data.brandColor }
                  : undefined
              }
            >
              Customer Portal
            </p>
            <h1 className="mt-1 text-xl font-bold text-[var(--app-text)]">
              {bootstrap.data.business.name}
            </h1>
          </div>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-text)]"
          type="button"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </header>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--app-border)]">
        {screenPaths
          .filter(
            (key) =>
              key === "home" ||
              !screenInfo[key].feature ||
              allowed.includes(screenInfo[key].feature!),
          )
          .map((key) => {
            const Icon = screenInfo[key].icon;
            const active = activeScreen === key;
            return (
              <Link
                key={key}
                href={`/portal/${businessSlug}/${key}`}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm ${active ? "border-[var(--app-primary)] font-semibold text-[var(--app-primary)]" : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {screenInfo[key].title}
              </Link>
            );
          })}
      </nav>
      <section className="mb-5">
        <h2 className="text-xl font-bold text-[var(--app-text)]">
          {screenInfo[activeScreen].title}
        </h2>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          Your own records from {bootstrap.data.business.name}.
        </p>
      </section>
      <DataScreen
        screen={activeScreen}
        token={token}
        businessSlug={businessSlug}
        currency={bootstrap.data.business.currency}
        locale={bootstrap.data.business.locale}
      />
    </main>
  );
}
