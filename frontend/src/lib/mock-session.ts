import type { Role } from "@/lib/nav-items";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface SessionBusiness {
  id: string;
  name: string;
  slug: string;
  currency: string;
  locale: string;
  branches: { id: string; name: string }[];
}

export interface Session {
  user: SessionUser;
  business: SessionBusiness;
  notifications: { id: string; title: string; body: string; read: boolean; createdAt: string }[];
}

/**
 * Stand-in for the real session (wired live in INT-001). Every FE-M0 screen
 * is built against this shape so the real API only has to satisfy the same
 * contract, not change how any component consumes it.
 */
export function useMockSession(): Session {
  return {
    user: { id: "u1", name: "Amara Osei", email: "amara@sunsethair.co", role: "owner" },
    business: {
      id: "b1",
      name: "Sunset Hair Studio",
      slug: "sunset-hair-studio",
      currency: "USD",
      locale: "en",
      branches: [
        { id: "b1", name: "Downtown" },
        { id: "b2", name: "Riverside Mall" },
      ],
    },
    notifications: [
      {
        id: "n1",
        title: "Low stock: Argan Oil Shampoo",
        body: "3 left — reorder soon.",
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      },
      {
        id: "n2",
        title: "New 5★ review from Priya K.",
        body: '"Best haircut in town!"',
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      },
      {
        id: "n3",
        title: "Nightly close ready",
        body: "Yesterday's summary is in.",
        read: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      },
    ],
  };
}
