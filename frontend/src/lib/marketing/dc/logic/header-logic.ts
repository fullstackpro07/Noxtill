/* eslint-disable @typescript-eslint/no-explicit-any */
import { DcLogic } from "@/components/site/dc/dc-host";
import { dcIcon } from "@/components/site/dc/dc-icon";

/**
 * Component logic of `docs/Noxtill Header Build/NoxtillHeader.dc.html`, ported verbatim. Changes:
 * icons come from dcIcon (same lucide@0.460.0 geometry) instead of window.lucide, and the initial
 * width is fixed so server and client render the same markup — the real width is read on mount.
 */
type Props = { previewMenu?: string; forceMobile?: boolean; collapseUtility?: boolean };
type State = { open: string | null; w: number; scrolled: boolean; drawer: boolean; sect: string | null; acc?: number | null };

export class HeaderLogic extends DcLogic<Props, State> {
  state: State = { open: null, w: 1400, scrolled: false, drawer: false, sect: null };
  trig: Record<string, HTMLElement | null> = {};
  pan: Record<string, HTMLElement | null> = {};
  root: HTMLElement | null = null;
  drawerEl: HTMLElement | null = null;
  ot?: ReturnType<typeof setTimeout>;
  ct?: ReturnType<typeof setTimeout>;
  hoverAt = 0;
  onResize: () => void = () => {};
  onScroll: () => void = () => {};
  onDown: (e: MouseEvent) => void = () => {};
  onKey: (e: KeyboardEvent) => void = () => {};
  IDS = ["platform", "ai", "solutions", "industries", "resources"];

  P = [
    { h: "Sales & Commerce", items: [["Fast Sale (POS)", "fast-sale", "ScanLine"], ["Orders", "orders", "ReceiptText"], ["Products & Services", "products-services", "Package"], ["Inventory", "inventory", "Boxes"], ["Bookings", "bookings", "CalendarDays"], ["Website & Commerce", "website-commerce", "AppWindow"]] },
    { h: "Customers & Communication", items: [["Customers (CRM)", "crm", "Users"], ["Unified Inbox", "unified-inbox", "Inbox"], ["Reviews & Reputation", "reviews-reputation", "Star"], ["Customer Service & Helpdesk", "helpdesk", "Headset"], ["Customer Portal & Self-Service", "customer-portal", "CircleUserRound"]] },
    { h: "Marketing & Growth", items: [["Marketing & Campaigns", "marketing-campaigns", "Megaphone"], ["Social Media Management", "social-media", "Share2"], ["Advertising", "advertising", "Target"], ["Business Listings", "business-listings", "MapPin"], ["Competitive Insights", "competitive-insights", "Radar"]] },
    { h: "Finance & Operations", items: [["Credit", "credit", "NotebookPen"], ["Profit & Analytics", "profit-analytics", "TrendingUp"], ["Finance & Accounting", "finance-accounting", "Landmark"], ["Payments & Billing", "payments-billing", "CreditCard"], ["Procurement", "procurement", "ClipboardList"]] },
    { h: "People & Field Operations", items: [["Staff", "staff", "UsersRound"], ["People & Payroll", "people-payroll", "Wallet"], ["Delivery & Riders", "delivery-riders", "Bike"], ["Field Service & Work Orders", "field-service", "Wrench"], ["Assets & Maintenance", "assets-maintenance", "PackageCheck"]] },
    { h: "Business Management & Platform", items: [["Dashboard", "dashboard", "LayoutDashboard"], ["Branches", "branches", "Building2"], ["Reports", "reports", "ChartNoAxesCombined"], ["Settings", "settings", "Settings"], ["Integrations", "integrations", "Plug"], ["Projects & Tasks", "projects-tasks", "ListChecks"], ["Automations & Workflows", "automations-workflows", "Workflow"], ["Documents, Contracts & eSign", "documents-esign", "Signature"]] },
  ];
  AI = [
    ["AI Assistant", "assistant", "Sparkles", "Ask about sales, customers, bookings and stock."],
    ["AI Phone Receptionist", "phone-receptionist", "PhoneCall", "Answers calls, qualifies leads, books appointments."],
    ["AI Photo Digitizer", "photo-digitizer", "ScanText", "Turns paper records into data you review first."],
    ["Business Intelligence", "business-intelligence", "ChartColumn", "KPIs, trends and the evidence behind them."],
    ["AI Reply Drafting", "reply-drafting", "MessageSquareText", "Context-aware drafts you edit before sending."],
    ["AI Agents & Workflows", "agents-workflows", "BrainCircuit", "Multi-step work with human approvals."],
    ["SEO Autopilot", "seo-autopilot", "Search", "Search visibility, local SEO and metadata."],
    ["Autonomous Commerce", "autonomous-commerce", "Bot", "Commerce optimisation within your rules."],
    ["AI-Powered Insights & Recommendations", "insights-recommendations", "Lightbulb", "Anomalies, risks and opportunities, explained."],
  ];
  SOL = [
    ["Reduce No-Shows", "reduce-no-shows", "CalendarCheck", "Reminders and confirmations that keep your calendar full."],
    ["Collect More Reviews", "collect-more-reviews", "ThumbsUp", "Ask happy customers at the right moment."],
    ["Track Customer Credit", "track-customer-credit", "HandCoins", "Know who owes what, and follow up on time."],
    ["Know Your Real Profit", "know-your-real-profit", "CircleDollarSign", "See margins after every cost, not just revenue."],
    ["Run Several Locations", "run-several-locations", "MapPinned", "One clear view across every branch."],
    ["Bring Paper Records In", "bring-paper-records-in", "FileScan", "Move notebooks and files into Noxtill."],
    ["Fast Sale", "fast-sale", "Timer", "Ring up a sale in seconds, at the counter or on the go."],
  ];
  IND = [
    ["Automotive", "automotive", "Car"], ["Auto Detailing", "auto-detailing", "SprayCan"], ["Car Washes", "car-washes", "Droplets"], ["Beauty & Personal Care", "beauty-personal-care", "Scissors"],
    ["Coworking Spaces", "coworking-spaces", "LampDesk"], ["E-commerce & Dropshipping", "ecommerce-dropshipping", "ShoppingBasket"], ["Education & Training", "education-training", "GraduationCap"], ["Electrical Contractors", "electrical-contractors", "Zap"],
    ["Equipment Rental", "equipment-rental", "Forklift"], ["Events & Creative", "events-creative", "Camera"], ["Fitness & Wellness", "fitness-wellness", "Dumbbell"], ["HVAC Companies", "hvac", "AirVent"],
    ["Healthcare & Clinics", "healthcare-clinics", "Stethoscope"], ["Home & Field Services", "home-field-services", "House"], ["Landscaping & Lawn Care", "landscaping-lawn-care", "Trees"], ["Pest Control", "pest-control", "Bug"],
    ["Pet Services", "pet-services", "PawPrint"], ["Plumbing Companies", "plumbing", "ShowerHead"], ["Property Management", "property-management", "KeyRound"], ["Real Estate & Property", "real-estate-property", "Building"],
    ["Restaurants & Food", "restaurants-food", "UtensilsCrossed"], ["Retail & Local Commerce", "retail-local-commerce", "Store"],
  ];
  RES = [
    { h: "Learn", items: [["Resources", "/resources", "Library", "Guides, templates and articles."], ["Blog", "/blog", "Newspaper", "Ideas for running a better business."], ["Getting Started Guide", "/getting-started", "Rocket", "Set up Noxtill step by step."], ["Product Updates", "/product-updates", "BellRing", "What's new in Noxtill."]] },
    { h: "Support", items: [["Help Centre", "/help", "LifeBuoy", "Answers and how-tos."], ["Contact Support", "/support", "MessagesSquare", "Talk to our team."]] },
    { h: "Developers", items: [["API Reference", "/developers/api", "Braces", "Endpoints, auth and schemas."], ["Developer Docs", "/developers/docs", "BookOpenText", "Build on Noxtill."]] },
    { h: "Free Business Tools", items: [["Business Health Check", "/tools/business-health-check", "HeartPulse", "A quick diagnostic of your operations."], ["Business Health Score", "/tools/business-health-score", "Gauge", "Benchmark how your business is doing."]] },
  ];

  componentDidMount() {
    const pm = this.props.previewMenu;
    if (pm && pm !== "none") this.setState({ open: pm });
    this.onResize = () => this.setState({ w: window.innerWidth });
    this.onScroll = () => {
      const s = window.scrollY > 24;
      if (s !== this.state.scrolled) this.setState({ scrolled: s });
    };
    this.onDown = (e) => {
      if (this.state.open && this.root && !this.root.contains(e.target as Node)) this.close();
    };
    this.onKey = (e) => {
      if (e.key !== "Escape") return;
      const o = this.state.open;
      if (o) {
        this.close();
        this.trig[o]?.focus();
      } else if (this.state.drawer) this.setState({ drawer: false, sect: null });
    };
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("mousedown", this.onDown);
    document.addEventListener("keydown", this.onKey);
    this.onResize();
    this.onScroll();
  }
  componentDidUpdate(prev: Props) {
    if (prev.previewMenu !== this.props.previewMenu) this.setState({ open: this.props.previewMenu && this.props.previewMenu !== "none" ? this.props.previewMenu : null });
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("mousedown", this.onDown);
    document.removeEventListener("keydown", this.onKey);
    clearTimeout(this.ot);
    clearTimeout(this.ct);
  }

  close() {
    clearTimeout(this.ot);
    clearTimeout(this.ct);
    if (this.state.open) this.setState({ open: null });
  }
  enter(id: string) {
    clearTimeout(this.ct);
    clearTimeout(this.ot);
    if (this.state.open) {
      if (this.state.open !== id) {
        this.setState({ open: id });
        this.hoverAt = Date.now();
      }
    } else
      this.ot = setTimeout(() => {
        this.setState({ open: id });
        this.hoverAt = Date.now();
      }, 90);
  }
  click(id: string) {
    clearTimeout(this.ot);
    if (this.state.open === id && Date.now() - (this.hoverAt || 0) > 450) {
      this.setState({ open: null });
    } else {
      this.setState({ open: id });
    }
    this.hoverAt = 0;
  }
  key(e: React.KeyboardEvent, id: string) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.setState({ open: id });
      setTimeout(() => {
        const a = this.pan[id] && this.pan[id]!.querySelector("a");
        a?.focus();
      }, 40);
    }
  }

  ic(n: string, s = 18) {
    return dcIcon(n, s, 1.75);
  }

  renderVals() {
    const o = this.state.open,
      ic = (n: string, s?: number) => this.ic(n, s);
    const m: Record<string, any> = {},
      t: Record<string, any> = {},
      enter: Record<string, any> = {},
      click: Record<string, any> = {},
      key: Record<string, any> = {},
      tref: Record<string, any> = {},
      pref: Record<string, any> = {};
    this.IDS.forEach((id) => {
      const on = o === id;
      m[id] = { op: on ? 1 : 0, vis: on ? "visible" : "hidden", ty: on ? "0px" : "-6px" };
      t[id] = { bg: on ? "rgba(24,190,134,.08)" : "transparent", fg: on ? "#053F2B" : "#06171D", rot: on ? "180deg" : "0deg", exp: on ? "true" : "false" };
      enter[id] = () => this.enter(id);
      click[id] = () => this.click(id);
      key[id] = (e: React.KeyboardEvent) => this.key(e, id);
      tref[id] = (el: HTMLElement | null) => {
        this.trig[id] = el;
      };
      pref[id] = (el: HTMLElement | null) => {
        this.pan[id] = el;
      };
    });
    const platform = this.P.map((g) => ({ h: g.h, items: g.items.map(([label, s, i]) => ({ label, href: "/platform/" + s, ic: ic(i, 16) })) }));
    const platCols = [0, 2, 4].map((i) => ({ groups: [platform[i], platform[i + 1]] }));
    const ai = this.AI.map(([label, s, i, desc]) => ({ label, desc, href: "/ai/" + s, ic: ic(i, 18) }));
    const solutions = this.SOL.map(([label, s, i, desc]) => ({ label, desc, href: "/solutions/" + s, ic: ic(i, 18) }));
    const industries = this.IND.map(([label, s, i]) => ({ label, href: "/industries/" + s, ic: ic(i, 17) }));
    const resources = this.RES.map((g) => ({ h: g.h, items: g.items.map(([label, href, i, desc]) => ({ label, href, desc, ic: ic(i, 18) })) }));
    const flow = ["Data", "Context", "Intelligence", "Draft", "Approval", "Action", "Audit"];
    const aiFlow = flow.map((label, i) => ({ label, more: i < flow.length - 1 }));

    const mobile = !!this.props.forceMobile || this.state.w < 1180;
    const sects: Record<string, { title: string; href: string; cta: string; groups: { h: string; items: any[] }[] }> = {
      platform: { title: "Platform", href: "/platform", cta: "Explore Platform", groups: platform },
      ai: { title: "AI & Intelligence", href: "/ai", cta: "Explore AI & Intelligence", groups: [{ h: "", items: ai }, { h: "Responsible AI", items: [{ label: "AI Transparency", href: "/ai-transparency", ic: ic("ShieldCheck", 18) }] }] },
      solutions: { title: "Solutions", href: "/solutions", cta: "Explore All Solutions", groups: [{ h: "", items: solutions }] },
      industries: { title: "Industries", href: "/industries", cta: "See All 300 Business Types", groups: [{ h: "", items: industries }] },
      resources: { title: "Resources", href: "/resources", cta: "Visit Resources", groups: resources },
    };
    const sec = (id: string, label: string) => ({
      label,
      isSect: true,
      isLink: false,
      open: () => {
        this.setState({ sect: id, acc: null });
        if (this.drawerEl) this.drawerEl.scrollTop = 0;
      },
    });
    const mroot = [sec("platform", "Platform"), sec("ai", "AI & Intelligence"), sec("solutions", "Solutions"), sec("industries", "Industries"), { label: "Pricing", href: "/pricing", isLink: true, isSect: false }, sec("resources", "Resources")];
    const collapse = (this.props.collapseUtility ?? true) && this.state.scrolled;

    return {
      rootRef: (el: HTMLElement | null) => {
        this.root = el;
      },
      isDesktop: !mobile,
      isMobile: mobile,
      utilH: collapse ? "0px" : "30px",
      barShadow: this.state.scrolled ? "0 8px 24px -14px rgba(6,23,29,.18)" : "none",
      scrimOp: o ? 1 : 0,
      m,
      t,
      enter,
      click,
      key,
      tref,
      pref,
      leaveTrig: () => clearTimeout(this.ot),
      leaveZone: () => {
        clearTimeout(this.ot);
        clearTimeout(this.ct);
        if (this.state.open) this.ct = setTimeout(() => this.close(), 180);
      },
      enterZone: () => clearTimeout(this.ct),
      platCols,
      platform,
      ai,
      solutions,
      industries,
      resources,
      aiFlow,
      chev: ic("ChevronDown", 15),
      chevSm: ic("ChevronDown", 13),
      chevR: ic("ChevronRight", 20),
      chevL: ic("ChevronLeft", 18),
      arrow: ic("ArrowRight", 16),
      arrowSm: ic("ArrowRight", 14),
      icGlobe: ic("Globe", 15),
      icShield: ic("ShieldCheck", 17),
      drawer: this.state.drawer,
      drawerExp: this.state.drawer ? "true" : "false",
      menuIc: ic(this.state.drawer ? "X" : "Menu", 22),
      toggleDrawer: () => this.setState((s) => ({ drawer: !s.drawer, sect: null })),
      backDrawer: () => this.setState({ sect: null }),
      atRoot: !this.state.sect,
      inSect: !!this.state.sect,
      msec: (() => {
        const sc = sects[this.state.sect || ""] || sects.platform;
        return Object.assign({}, sc, {
          groups: sc.groups.map((g, i) => {
            const acc = !!g.h;
            const isOpen = this.state.acc === i;
            return Object.assign({}, g, {
              acc,
              show: !acc || isOpen,
              exp: isOpen ? "true" : "false",
              rot: isOpen ? "180deg" : "0deg",
              bg: isOpen ? "rgba(24,190,134,.08)" : "transparent",
              toggle: () => this.setState((s2) => ({ acc: s2.acc === i ? null : i })),
            });
          }),
        });
      })(),
      mroot,
    };
  }
}
