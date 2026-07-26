export interface PlanDef {
  key: string;
  name: string;
  price: number;
  msgQuota: number;
  userLimit: number;
  features: string[];
}

/** Mirrors DEFAULT_PLANS on the backend (BE-064) exactly — key, price, msgQuota, userLimit all match. */
export const PLANS: PlanDef[] = [
  {
    key: "basic",
    name: "Basic",
    price: 0,
    msgQuota: 200,
    userLimit: 2,
    features: ["POS & Orders", "Credit ledger", "Basic reviews"],
  },
  {
    key: "starter",
    name: "Starter",
    price: 19,
    msgQuota: 1000,
    userLimit: 5,
    features: ["Everything in Basic", "Bookings", "CRM & segments"],
  },
  {
    key: "pro",
    name: "Pro",
    price: 49,
    msgQuota: 5000,
    userLimit: 15,
    features: ["Everything in Starter", "Marketing campaigns", "Staff commissions", "AI assistant"],
  },
  {
    key: "premium",
    name: "Premium",
    price: 99,
    msgQuota: 20000,
    userLimit: 50,
    features: ["Everything in Pro", "Multi-branch roll-up", "Marketing integrations hub"],
  },
];
