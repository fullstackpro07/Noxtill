"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useBookingsSearchStore } from "@/store/bookings-search-store";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { WalkInDialog } from "@/components/bookings/walk-in-dialog";

const SUBTITLE_BY_PATH: { prefix: string; subtitle: string }[] = [
  { prefix: "/bookings/appointments", subtitle: "Every appointment, past and upcoming" },
  { prefix: "/bookings/walk-ins", subtitle: "Customers who arrived without a booking" },
  { prefix: "/bookings/requests", subtitle: "Approve, decline or suggest a different time" },
  { prefix: "/bookings/waiting-list", subtitle: "Offer a freed-up slot the moment one opens" },
  { prefix: "/bookings/queue", subtitle: "Walk-in ticket numbers, called in order" },
  { prefix: "/bookings/link", subtitle: "Your public booking page and its performance" },
  { prefix: "/bookings/availability", subtitle: "Working hours, time off and utilisation per staff" },
  { prefix: "/bookings/deposits", subtitle: "Held, captured, refunded and forfeited deposits" },
  { prefix: "/bookings/no-shows", subtitle: "Who missed their appointment, and what it cost" },
  { prefix: "/bookings/reminders", subtitle: "Automatic reminders before every appointment" },
];

function BookingsHeaderContent() {
  const pathname = usePathname();
  const session = useSession();
  const [walkInOpen, setWalkInOpen] = useState(false);
  const query = useBookingsSearchStore((s) => s.query);
  const setQuery = useBookingsSearchStore((s) => s.setQuery);
  const subtitle = SUBTITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix))?.subtitle ?? "Today's schedule across every staff member";

  useModuleHeader({
    title: "Bookings",
    subtitle,
    search: (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, phone or service..."
          aria-label="Search bookings"
          className="w-full rounded-[10px] py-2.5 ps-9 pe-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)" }}
        />
      </div>
    ),
    actions: (
      <>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/book/${session.business.slug}`).catch(() => undefined);
            toast.success("Booking link copied.");
          }}
          className="hidden h-[38px] items-center rounded-[10px] px-3.5 text-[12.5px] font-bold sm:flex"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
        >
          Copy Booking Link
        </button>
        <button
          type="button"
          onClick={() => setWalkInOpen(true)}
          className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-extrabold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          + Walk-in
        </button>
      </>
    ),
  });

  return <WalkInDialog open={walkInOpen} onClose={() => setWalkInOpen(false)} date={new Date().toISOString().slice(0, 10)} existingAppointments={[]} />;
}

export default function BookingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <BookingsHeaderContent />
      <ModuleTabs moduleKey="bookings" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
