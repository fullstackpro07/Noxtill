export interface PlanDef {
  key: string;
  name: string;
  price: number;
  msgQuota: number;
  userLimit: number;
  features: string[];
}

/**
 * Mirrors DEFAULT_PLANS on the backend (billing.constants.ts) exactly — key, price, msgQuota,
 * userLimit all match. Prices are the month-to-month USD prices on the public pricing page
 * (/pricing); the feature lines are that page's own plan highlights.
 */
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
    price: 39,
    msgQuota: 1000,
    userLimit: 2,
    features: ["Fast Sale (POS), orders and invoices", "Bookings and Customers (CRM)", "Inventory and Customer Credit", "AI Assistant and Photo Digitizer"],
  },
  {
    key: "growth",
    name: "Growth",
    price: 79,
    msgQuota: 5000,
    userLimit: 5,
    features: ["Everything in Starter", "Unified Inbox", "Marketing & Campaigns, Reviews", "Automations & Workflows", "AI Receptionist agent"],
  },
  {
    key: "professional",
    name: "Professional",
    price: 159,
    msgQuota: 20000,
    userLimit: 15,
    features: ["Everything in Growth", "Finance & Accounting, People & Payroll", "Field Service, Helpdesk, Customer Portal", "Contracts & eSign", "Full audit trail"],
  },
  {
    key: "business",
    name: "Business",
    price: 319,
    msgQuota: 20000,
    userLimit: 40,
    features: ["Everything in Professional", "Branches (multi-location roll-up)", "Business Intelligence, SEO Autopilot", "Procurement, Assets & Maintenance", "Priority support"],
  },
];
