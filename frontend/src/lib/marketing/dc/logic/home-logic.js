/* eslint-disable */
// Component logic of docs/Noxtill Header Build/Noxtill Home.dc.html, kept verbatim. Changes from the
// design: icons come from dcIcon (same lucide@0.460.0 geometry) instead of window.lucide; the initial
// width is the design default (1440) on server and client, with the real width read on mount; the
// nx-js class, reveal markers and Escape handler are reset on unmount so a remount works; the tab
// screenshot path points at /marketing/hb; the Nightly Close chat also starts when its phone is on
// screen (the stacked mobile section is taller than 30% of any phone screen can show); the AI carousel
// re-centres its card when the width changes.
import { createElement } from "react";
import { DcLogic } from "@/components/site/dc/dc-host";
import { dcIcon } from "@/components/site/dc/dc-icon";

export class HomeLogic extends DcLogic {
  state = { w: 1440, ready: true, hs: 0, nc: 0, j: 0, jUser: false, tab: 0, ai: 1, aiHold: false, rec: 0, mod: 0, pos: 0, hub: 0, faq: 0 };
  recEls = {};
  recTick = 0;

  componentDidMount() {
    this.recT = setInterval(() => { this.recTick = (this.recTick + 1) % 10; this.setState({ rec: Math.min(this.recTick, 7) }); }, 2300);
    try { const q = new URLSearchParams(location.search).get('industry'); const qi = q ? this.IND.findIndex(r => r[1] === q) : -1; if (qi >= 0) setTimeout(() => this.openInd(qi), 400); } catch (err) {}
    this.rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The AI carousel's card width follows the window width; keep the current card centred after it changes.
    this.onResize = () => { const w = window.innerWidth; if (w === this.state.w) return; this.setState({ w }, () => this.aiTo(this.state.ai, false)); };
    window.addEventListener('resize', this.onResize);
    this.onResize();
    document.documentElement.classList.add('nx-js');
    this.revIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.setAttribute('data-in', ''); this.revIO.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }) : null;
    this.scanReveal();
    this.onStack = () => this.stackFx();
    window.addEventListener('scroll', this.onStack, { passive: true }); window.addEventListener('resize', this.onStack);
    this.stackFx();
    setTimeout(() => this.aiTo(this.state.ai, false), 60);
    if (!this.rm) {
      this.tHero = setInterval(() => this.setState(s => ({ hs: (s.hs + 1) % 4 })), 5000);
      this.tJ = setInterval(() => { if (this.jIn && !this.state.jUser) this.setState(s => ({ j: (s.j + 1) % 6 })); }, 3200);
    }
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(es => es.forEach(e => {
        if ((e.target === this.ncEl || e.target === this.ncPhone) && e.isIntersecting && !this.ncStarted) {
          this.ncStarted = true;
          if (this.rm) this.setState({ nc: 14 });
          else { let k = 0; this.tNc = setInterval(() => { k = Math.min(k + 1, 14); this.setState({ nc: k }); if (k >= 14) clearInterval(this.tNc); }, 800); }
        }
        if (e.target === this.jEl) this.jIn = e.isIntersecting;
      }), { threshold: 0.3 });
      this.ioRec = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) this.setState({ rec: +e.target.dataset.step }); }), { rootMargin: '-45% 0px -45% 0px' });
      setTimeout(() => {
        this.ncEl && this.io.observe(this.ncEl); this.jEl && this.io.observe(this.jEl);
        // Stacked (one-column) layout: the section is taller than the screen, so 30% of it may never be
        // visible at once; start the chat when the phone itself is on screen instead.
        this.ncPhone = this.ncEl && this.ncEl.querySelector('[aria-live]');
        if (this.ncPhone) this.io.observe(this.ncPhone);
      }, 300);
    } else this.setState({ nc: 4 });
  }
  componentDidUpdate() { this.scanReveal(); }
  scanReveal() { document.querySelectorAll('[data-reveal]:not([data-obs])').forEach(el => { el.setAttribute('data-obs', ''); if (this.revIO && !this.rm) this.revIO.observe(el); else el.setAttribute('data-in', ''); }); }
  stackFx() {
    if (this.stRaf) return;
    this.stRaf = requestAnimationFrame(() => {
      this.stRaf = 0; const box = this.stackEl; if (!box) return;
      const arts = [...box.children].filter(n => n.tagName === 'ARTICLE');
      const on = window.innerWidth >= 1024 && !this.rm, vh = window.innerHeight;
      arts.forEach((a, i) => {
        if (!on) { a.style.transform = ''; a.style.opacity = ''; return; }
        const r = a.getBoundingClientRect(), nx = arts[i + 1];
        const covered = nx && r.top <= 100 + i * 12 + 1 && nx.getBoundingClientRect().top < r.top + r.height * 0.55;
        const entered = r.top < vh - 80;
        a.style.transform = covered ? 'scale(.985)' : entered ? 'none' : 'translateY(10px)';
        a.style.opacity = covered ? '.92' : entered ? '1' : '.96';
      });
    });
  }
  aiTo(i, smooth = true) { const el = this.aiEl; if (!el) return; const c = el.querySelectorAll('article')[i]; if (!c) return; el.scrollTo({ left: c.offsetLeft - (el.clientWidth - c.offsetWidth) / 2, behavior: smooth && !this.rm ? 'smooth' : 'auto' }); if (this.state.ai !== i) this.setState({ ai: i }); }
  aiNearest() { const el = this.aiEl; if (!el) return 0; const mid = el.scrollLeft + el.clientWidth / 2; let best = 0, bd = 1e9; el.querySelectorAll('article').forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } }); return best; }
  aiSync() { if (this.aiRaf || this.aiDragging) return; this.aiRaf = requestAnimationFrame(() => { this.aiRaf = 0; const i = this.aiNearest(); if (i !== this.state.ai) this.setState({ ai: i }); }); }
  aiDrag(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = this.aiEl; if (!el) return;
    const x0 = e.clientX, s0 = el.scrollLeft; let moved = false;
    this.aiDragging = true; this.aiDragged = false;
    const mv = ev => { const dx = ev.clientX - x0; if (!moved && Math.abs(dx) > 5) { moved = true; el.style.scrollSnapType = 'none'; el.style.cursor = 'grabbing'; el.style.userSelect = 'none'; } if (moved) el.scrollLeft = s0 - dx; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.aiDragging = false; if (!moved) return; this.aiDragged = true; el.style.cursor = ''; el.style.userSelect = ''; const i = this.aiNearest(); el.style.scrollSnapType = ''; this.aiTo(i); setTimeout(() => { this.aiDragged = false; }, 50); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }
  SHORT = {'home-field-services': 'Home Services', 'real-estate-property': 'Real Estate', 'fruit-vegetable': 'Fruit & Veg', 'retail-local-commerce': 'Retail', 'healthcare-clinics': 'Healthcare'};
  indStep(d) { const el = this.indEl; if (!el) return; const li = el.querySelector('li'); const step = li ? li.offsetWidth + 16 : 320; const w = this.state.w, cols = w >= 1200 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1; el.scrollBy({ left: d * step * cols, behavior: this.rm ? 'auto' : 'smooth' }); }
  indSync() { if (this.indRaf) return; this.indRaf = requestAnimationFrame(() => { this.indRaf = 0; const el = this.indEl; if (!el) return; const max = el.scrollWidth - el.clientWidth; const li = el.querySelector('li'); const step = li ? li.offsetWidth + 16 : 320; const prog = max > 0 ? el.scrollLeft / max : 0; const act = Math.round(el.scrollLeft / step); if (Math.abs(prog - (this.state.indProg || 0)) > 0.002 || act !== (this.state.indActive || 0)) this.setState({ indProg: prog, indActive: act }); }); }
  openInd(ix, el) {
    this.indLast = el || document.activeElement; this.indScrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    clearTimeout(this.indCloseT);
    this.setState({ indOpen: ix, indClosing: false });
    setTimeout(() => { const b = this.dlgEl && this.dlgEl.querySelector('button'); if (b) b.focus({ preventScroll: true }); }, 30);
    if (!this.escH) { this.escH = e => { if (e.key === 'Escape' && this.state.indOpen != null) this.closeInd(); }; window.addEventListener('keydown', this.escH); }
  }
  closeInd() {
    const done = () => { this.setState({ indOpen: null, indClosing: false }); document.body.style.overflow = ''; if (this.indScrollY != null) window.scrollTo(0, this.indScrollY); if (this.indLast && this.indLast.focus) this.indLast.focus({ preventScroll: true }); };
    if (this.rm) { done(); return; }
    this.setState({ indClosing: true }); this.indCloseT = setTimeout(done, 200);
  }
  trapInd(e) {
    if (e.key !== 'Tab' || !this.dlgEl) return;
    const f = [...this.dlgEl.querySelectorAll('a[href], button:not([disabled])')]; if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  MODDESC = {"Quotes & Orders":"Send quotes and turn accepted work into confirmed orders.","Field Service":"Teams see jobs, addresses and checklists on their phone.","Staff":"Manage shifts, roles, permissions and team activity.","Payments & Billing":"Take payment and keep invoices connected to the work.","Reviews & Reputation":"Ask happy customers for reviews after every visit or job.","Customers":"Every customer, visit, purchase and note in one profile.","Quotes & Orders":"Send quotes and turn them into confirmed orders in one click.","Projects & Tasks":"Track every deal, property and to-do with clear owners.","Reviews & Reputation":"Ask happy customers for reviews and reply from one place.","Marketing & Campaigns":"Win back customers with targeted offers and messages.","Bookings":"Customers book online or by WhatsApp; staff calendars stay in sync.","No-show prevention":"Automatic confirmations and reminders cut empty slots.","Customers (CRM)":"Every customer, visit, purchase and note in one profile.","Payments":"Card, cash and online payments recorded against each customer.","Reviews":"Ask happy customers for reviews and reply from one place.","Fast Sale":"Quick checkout at the counter with stock updating instantly.","Orders":"Track every order from placed to paid to delivered.","Inventory":"Stock updates with every sale, with low-stock alerts.","Customer messaging":"Send updates and offers on WhatsApp, SMS and email.","Reporting":"Daily sales, top items and trends without spreadsheets.","Website & Commerce":"Sell online from the same catalogue and stock count.","Credit":"Track who owes what and send polite payment reminders.","Profit & Analytics":"See real profit by product, service and branch.","Work orders":"Log each job, parts used, technician and status.","Invoices":"Create, send and track invoices until they are paid.","Follow-up":"Automatic follow-ups for service dues and repeat visits.","Reminders":"WhatsApp and SMS reminders before every appointment.","Customer Portal":"Customers view bookings, documents and payments themselves.","Staff":"Shifts, roles, permissions and performance for your team.","Quotes":"Send professional quotes and turn them into jobs in one click.","Field Service":"Teams see jobs, addresses and checklists on their phone.","Dispatch":"Assign jobs or deliveries to the right person and track them.","Payments & Billing":"Recurring fees, memberships and invoices on autopilot.","Campaigns":"Win back customers with targeted offers and messages.","Documents & eSign":"Contracts and forms signed digitally and stored safely.","Unified Inbox":"WhatsApp, email and social messages in one inbox.","Tasks":"Assign follow-ups and to-dos so nothing slips.","Loyalty":"Points and rewards that bring regulars back.","Purchasing":"Purchase orders and supplier bills linked to stock.","Warranty":"Track warranties and service claims for every sale."};
  DAY = {
    'home-field-services': ['See today’s jobs, quotes, staff schedule and anything that needs attention.', 'Jobs, staff, customers and payments stay connected as work happens.'],
    'retail-local-commerce': ['See yesterday’s sales, low-stock items and today’s online orders in one view.', 'Every sale updates stock, the customer record and your profit as it happens.'],
    'automotive': ['See today’s bookings, open jobs and parts that need ordering.', 'Jobs, parts, customers and orders stay in sync as each vehicle moves through the workshop.'],
    'healthcare-clinics': ['See today’s appointments, unconfirmed visits and unread patient messages.', 'Bookings, messages, payments and staff schedules stay in sync as patients arrive.'],
    'beauty-personal-care': ['See today’s bookings, each stylist’s schedule and unanswered messages.', 'Bookings, payments and customer history stay in sync with every visit.'],
    'restaurants-food': ['See today’s prep needs, low stock and pre-orders before service starts.', 'Counter, kitchen and delivery orders update stock and sales as they happen.'],
    'fitness-wellness': ['See today’s classes, member check-ins and renewals that are due.', 'Bookings, memberships and payments stay in sync as members come and go.'],
    'real-estate-property': ['See new leads, today’s viewings and contracts waiting for signature.', 'Leads, tasks, documents and messages stay connected as each deal moves.']
  };
  indModal(ic) {
    const ix = this.state.indOpen;
    if (ix == null || !this.IND[ix]) return { open: false };
    const [n, slug, i2, line, flow] = this.IND[ix];
    const im = this.IMG[slug] || Object.values(this.IMG)[0];
    const mob = this.state.w <= 640, closing = !!this.state.indClosing;
    const dd = this.DAY[slug] || ['Open Noxtill and see today’s ' + flow[0].toLowerCase() + ' and anything that needs attention.', flow[1] + ', ' + flow[2].toLowerCase() + ' and customer records stay in sync as work happens.'];
    return { open: true, n, line, ic: ic(i2, 22), href: '/industries/' + slug, start: '/signup?industry=' + slug, startLabel: 'Start free for ' + n,
      bg: 'url(https://images.unsplash.com/' + im[0] + '?auto=format&fit=crop&w=1000&q=72)', alt: im[1],
      w: mob ? '100%' : '740px', maxW: mob ? '100%' : 'calc(100vw - 48px)', h: mob ? '100dvh' : 'auto', maxH: mob ? '100dvh' : 'calc(100vh - 48px)', r: mob ? '0px' : '24px',
      align: mob ? 'stretch' : 'center', pad: mob ? '0px' : '24px', padX: mob ? '20px' : '32px', padB: mob ? 'calc(18px + env(safe-area-inset-bottom))' : '22px',
      imgH: mob ? '180px' : '160px', cols: mob ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', ctaFlex: mob ? '1 1 100%' : '0 0 auto',
      ovOp: closing ? 0 : 1, op: closing ? 0 : 1, tf: closing ? (mob ? 'translateY(24px)' : 'translateY(10px) scale(.985)') : 'none', anim: mob ? 'nxSheetIn' : 'nxDlgIn',
      steps: flow.map((t, k) => ({ k: k + 1, t, d: this.MODDESC[t] || 'Connected to every other part of Noxtill, so nothing is entered twice.' })),
      day: [{ t: 'MORNING', d: dd[0] }, { t: 'DURING THE DAY', d: dd[1] }, { t: 'AFTER CLOSING', d: 'Nightly Close summarises today’s sales, real profit, tomorrow’s work and anything that needs attention.' }] };
  }
  componentWillUnmount() {
    if (this.escH) window.removeEventListener('keydown', this.escH);
    this.escH = null;
    document.body.style.overflow = '';
    document.documentElement.classList.remove('nx-js');
    // a remount (React StrictMode, fast refresh) must observe the reveal targets again
    document.querySelectorAll('[data-reveal][data-obs]').forEach(el => el.removeAttribute('data-obs'));
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onStack); window.removeEventListener('resize', this.onStack);
    this.revIO && this.revIO.disconnect();
    [this.poll, this.tHero, this.tAi, this.tJ, this.tNc, this.recT].forEach(clearInterval);
    (this.posT || []).forEach(clearTimeout);
    this.io && this.io.disconnect(); this.ioRec && this.ioRec.disconnect();
    const s = document.getElementById('nx-faq-schema'); s && s.remove();
  }
  injectFaqSchema() {
    if (document.getElementById('nx-faq-schema')) return;
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'nx-faq-schema';
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: this.FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    document.head.appendChild(s);
  }

  ic(n, s = 18) {
    return dcIcon(n, s, 1.8);
  }

  EV = [
    { t: 'New booking received', d: 'Emily Carter · Haircut & style · Fri 4:30 PM', ic: 'CalendarPlus', fx: ['Bookings +1', 'Customer record updated'], when: '4:12 PM' },
    { t: 'Payment received', d: '$145.00 · Invoice #1042 · Card', ic: 'CreditCard', fx: ['Revenue updated', 'Invoice marked paid'], when: '4:18 PM' },
    { t: 'Low stock alert', d: 'Argan oil shampoo · 3 left', ic: 'PackageMinus', fx: ['Reorder suggested'], when: '4:21 PM' },
    { t: 'AI insight', d: 'Friday sales are consistently stronger than weekdays.', ic: 'Sparkles', fx: ['Based on the last 8 weeks'], when: '4:25 PM' },
  ];
  JOURNEY = [
    { t: 'Customer', ic: 'UserRound', screen: 'Customer profile', rows: [['Name', 'Emily Carter'], ['Visits', '6'], ['Channel', 'WhatsApp']], headline: 'One profile, found instantly', expl: 'Noxtill recognises Emily from her number. No duplicate record, no retyping.', fx: ['Existing profile matched', 'Preferences loaded'] },
    { t: 'Booking', ic: 'CalendarDays', screen: 'New booking', rows: [['Service', 'Haircut & style'], ['When', 'Fri 4:30 PM'], ['Staff', 'Sara']], headline: 'Booking created', expl: "The appointment lands on Sara's calendar and on Emily's profile at the same time.", fx: ['Staff calendar updated', 'Reminder scheduled for Thu 6 PM', 'Booking added to customer history'] },
    { t: 'Payment', ic: 'CreditCard', screen: 'Invoice #1042', rows: [['Amount', '$145.00'], ['Method', 'Card'], ['Status', 'Paid']], headline: 'Payment completed', expl: 'One payment updates every place that needs to know about it.', fx: ['Customer lifetime spend updated', 'Revenue updated', 'Order status updated'] },
    { t: 'Inventory', ic: 'Boxes', screen: 'Stock', rows: [['Argan oil shampoo', '−1'], ['On hand', '3'], ['Reorder at', '5']], headline: 'Stock adjusted', expl: 'Products used in the service come off stock automatically.', fx: ['Stock level reduced', 'Low-stock alert raised'] },
    { t: 'Follow-up', ic: 'MessageSquareHeart', screen: 'Follow-up', rows: [['Review request', 'In 2 hours'], ['Rebook prompt', 'In 5 weeks'], ['Channel', 'WhatsApp']], headline: 'Follow-up scheduled', expl: 'The right message goes out at the right time, without anyone remembering to send it.', fx: ['Review request queued', 'Rebooking reminder set'] },
    { t: 'Analytics', ic: 'ChartColumn', screen: 'Today', rows: [['Sales', '$3,005'], ['Bookings', '19'], ['Avg. ticket', '$62']], headline: 'Reports update themselves', expl: "Today's numbers include this visit, and so will tonight's Nightly Close.", fx: ['Daily sales updated', "Included in tonight's Nightly Close"] },
  ];
  TABS = [
    { k: 'sell', label: 'Sell Faster', h: 'Turn every opportunity into a sale.', p: 'Leads from every channel land in one pipeline, with quotes, invoices and payments one click away.', b: ['Leads from website, WhatsApp and forms', 'Sales pipeline and follow-ups', 'Quotes, invoices and payments', 'Full customer history'], cta: 'Explore Customers (CRM)', href: '/platform/crm', screen: 'Sales pipeline', ic: 'Kanban', alt: 'Noxtill sales pipeline with leads, quotes and won deals (demo data)' },
    { k: 'grow', label: 'Get More Customers', h: 'Be found, chosen and remembered.', p: 'Run campaigns, collect reviews and keep listings accurate, all tied to real customer records.', b: ['Campaigns by WhatsApp, email and social', 'Automatic review requests after each visit', 'Business listings kept up to date', 'Follow-up before a customer goes cold'], cta: 'Explore Marketing & Campaigns', href: '/platform/marketing-campaigns', screen: 'Marketing & reviews', ic: 'Megaphone', alt: 'Noxtill marketing view with campaign status and review requests (demo data)' },
    { k: 'noshow', label: 'Reduce No-Shows', h: 'Keep your calendar full.', p: 'Confirmations, reminders and easy rescheduling mean fewer empty chairs and fewer surprises.', b: ['Automatic confirmations and reminders', 'One-tap rescheduling for customers', 'Deposits for high-value bookings', 'Know what is due tomorrow'], cta: 'See how to Reduce No-Shows', href: '/solutions/reduce-no-shows', screen: 'Bookings · Friday', ic: 'CalendarCheck', alt: 'Noxtill bookings day view showing confirmed, reminded and rescheduled appointments (demo data)' },
    { k: 'profit', label: 'Increase Profit', h: 'See which products actually make money.', p: 'Noxtill matches revenue to real costs so you see margin by product, service and branch.', b: ['Profit after cost of goods and staff time', 'Margin by product and service', 'Cost visibility across suppliers', 'Business Intelligence on every number'], cta: 'Know Your Real Profit', href: '/solutions/know-your-real-profit', screen: 'Profit & margin', ic: 'TrendingUp', alt: 'Noxtill profit table comparing revenue, cost and margin by product (demo data)' },
    { k: 'auto', label: 'Automate Work', h: 'Let routine work run itself.', p: 'Build workflows from real business events, with approvals where they matter.', b: ['Triggers from bookings, payments and messages', 'Automated messages and tasks', 'Approvals before consequential steps', 'Every run recorded'], cta: 'Explore Automations & Workflows', href: '/platform/automations-workflows', screen: 'Workflow · Overdue invoice', ic: 'Workflow', alt: 'Noxtill workflow with a trigger, condition, approval and action (demo data)' },
    { k: 'multi', label: 'Run Multiple Locations', h: 'Every branch, one clear view.', p: 'Compare locations side by side and give each manager exactly the access they need.', b: ['Branch-level dashboards and reports', 'Permissions by role and location', 'Staff scheduling across sites', 'Shared customers and catalogue'], cta: 'Run Several Locations', href: '/solutions/run-several-locations', screen: 'Branches · Today', ic: 'Building2', alt: 'Noxtill multi-location dashboard comparing four branches (demo data)' },
  ];
  AI = [
    { n: 'AI Assistant', kind: 'PRODUCT', ic: 'Sparkles', href: '/ai/assistant', out: 'Ask a question about your business and get an answer from your own data.', und: ['Sales', 'Customers', 'Bookings', 'Inventory'], can: ['Answer questions', 'Summarise the day', 'Suggest next actions'], q: 'How did this week compare to last week?', a: 'Sales are ahead of last week, led by Friday. 3 bookings still need confirmation.', appr: false },
    { n: 'AI Phone Receptionist', kind: 'PRODUCT', ic: 'PhoneCall', href: '/ai/phone-receptionist', out: 'Answers routine calls, qualifies leads and books appointments while your team is busy.', und: ['Services', 'Opening hours', 'Availability', 'Caller history'], can: ['Book appointments', 'Capture details', 'Hand off to staff'], q: 'Caller: Can I come in Friday afternoon?', a: 'Sara has 4:30 PM free on Friday. Shall I book it for you?', appr: false },
    { n: 'AI Photo Digitizer', kind: 'PRODUCT', ic: 'ScanText', href: '/ai/photo-digitizer', out: 'Turns photos of paper records into structured data you review before saving.', und: ['Receipts', 'Ledgers', 'Price lists', 'Forms'], can: ['Extract fields', 'Match to records', 'Flag unclear values'], q: 'Photo: handwritten credit ledger', a: '12 entries found. 2 need your review before they are saved.', appr: true },
    { n: 'Business Intelligence', kind: 'PRODUCT', ic: 'ChartColumn', href: '/ai/business-intelligence', out: 'Shows performance, trends and the evidence behind every number.', und: ['KPIs', 'Branches', 'Products', 'Time periods'], can: ['Compare periods', 'Spot trends', 'Forecast where supported'], q: 'Which services have the best margin?', a: 'Colour treatments lead on margin this month. See the orders behind this.', appr: false },
    { n: 'SEO Autopilot', kind: 'PRODUCT', ic: 'Search', href: '/ai/seo-autopilot', out: 'Monitors search visibility and suggests the next improvements for your pages.', und: ['Business pages', 'Listings', 'Local search', 'Metadata'], can: ['Find content gaps', 'Draft metadata', 'Track visibility'], q: "Why isn't my services page showing locally?", a: "It's missing your city and opening hours. Fixes are drafted for your review.", appr: true },
    { n: 'Autonomous Commerce', kind: 'PRODUCT', ic: 'Bot', href: '/ai/autonomous-commerce', out: 'Finds commerce opportunities and acts within the rules you set.', und: ['Products', 'Stock', 'Pricing rules', 'Demand'], can: ['Recommend bundles', 'Adjust within limits', 'Flag opportunities'], q: 'Any slow-moving stock this month?', a: '2 products are slow. A bundle within your discount limit is ready to approve.', appr: true },
    { n: 'AI Reply Drafting', kind: 'CAPABILITY', ic: 'MessageSquareText', href: '/ai/reply-drafting', out: 'Drafts replies with full customer context, ready for you to edit and send.', und: ['Conversation', 'Orders', 'Bookings', 'History'], can: ['Draft replies', 'Pull order details', 'Match your tone'], q: 'Customer: Is my order ready?', a: 'Draft: Hi Emily, order #2210 is packed and ready for pickup today.', appr: true },
    { n: 'AI Agents & Workflows', kind: 'CAPABILITY', ic: 'BrainCircuit', href: '/ai/agents-workflows', out: 'Runs multi-step work from business triggers, with approvals where it matters.', und: ['Triggers', 'Rules', 'Roles', 'Records'], can: ['Execute steps', 'Create tasks', 'Request approval'], q: 'Trigger: invoice 7 days overdue', a: 'Reminder drafted, task created for Omar, approval requested before any late fee.', appr: true },
    { n: 'AI-Powered Insights', kind: 'CAPABILITY', ic: 'Lightbulb', href: '/ai/insights-recommendations', out: 'Surfaces anomalies, risks and opportunities, and explains why.', und: ['Sales', 'Cash', 'Customers', 'Operations'], can: ['Detect anomalies', 'Rank opportunities', 'Show evidence'], q: 'Anything I should know this week?', a: 'Fewer first-time customers are returning. Evidence: 18 first visits, 4 returns.', appr: false },
  ];
  REC = [
    ['Incoming call', 'The AI Receptionist answers in your business name, day or night.'],
    ['Caller identified', "The number matches Emily's customer profile, so the AI knows her history."],
    ['Intent detected', 'She wants a Friday afternoon appointment.'],
    ['Question answered', 'Opening hours, prices and policies come from your own settings.'],
    ['Appointment slot checked', "Real availability from your staff calendars, not a guess."],
    ['Booking created', 'The appointment is added to the calendar and the customer record.'],
    ['Confirmation sent', 'A WhatsApp confirmation goes to Emily with the date and time.'],
    ['CRM activity recorded', 'The call summary and transcript are saved to her profile.'],
  ];
  REC_MSGS = [
    { s: 0, w: 'ai', t: 'Thanks for calling Luma Studio. How can I help?' },
    { s: 1, w: 'sys', t: 'Caller identified · Emily Carter · 6 visits' },
    { s: 2, w: 'c', t: 'Can I get a haircut on Friday afternoon?' },
    { s: 2, w: 'sys', t: 'Intent · Book appointment' },
    { s: 3, w: 'c', t: 'How late are you open on Fridays?' },
    { s: 3, w: 'ai', t: "We're open until 7 PM on Fridays." },
    { s: 4, w: 'ai', t: 'Sara has 4:30 PM free. Would that work?' },
    { s: 4, w: 'c', t: 'Perfect, thank you.' },
    { s: 5, w: 'sys', t: 'Booking created · Fri 4:30 PM · Sara' },
    { s: 6, w: 'sys', t: 'Confirmation sent on WhatsApp' },
    { s: 7, w: 'sys', t: "Call summary saved to Emily's profile" },
  ];
  MODS = [
    { n: 'Sales & Commerce', ic: 'ShoppingCart', copy: 'Sell at the counter, online and by appointment from one catalogue and one stock count.', m: [['Fast Sale (POS)', '/platform/fast-sale', 'ScanLine'], ['Orders', '/platform/orders', 'ReceiptText'], ['Products & Services', '/platform/products-services', 'Package'], ['Bookings', '/platform/bookings', 'CalendarDays'], ['Inventory', '/platform/inventory', 'Boxes'], ['Website & Commerce', '/platform/website-commerce', 'AppWindow']], screen: 'Orders', cols: ['Order', 'Customer', 'Status', 'Total'], rows: [['#2210', 'Emily Carter', 'Ready', '$86.00'], ['#2209', 'Bilal R.', 'Delivered', '$42.50'], ['#2208', 'Walk-in', 'Paid', '$18.00'], ['#2207', 'Hina S.', 'Packed', '$129.00']] },
    { n: 'Customers & Communication', ic: 'Users', copy: 'Every customer, conversation and review attached to one profile.', m: [['Customers (CRM)', '/platform/crm', 'Users'], ['Reviews & Reputation', '/platform/reviews-reputation', 'Star'], ['Unified Inbox', '/platform/unified-inbox', 'Inbox'], ['Customer Service & Helpdesk', '/platform/helpdesk', 'Headset'], ['Customer Portal & Self-Service', '/platform/customer-portal', 'CircleUserRound']], screen: 'Customers', cols: ['Customer', 'Visits', 'Spend', 'Last contact'], rows: [['Emily Carter', '6', '$1,240', 'Today'], ['Bilal R.', '3', '$410', 'Mon'], ['Hina S.', '11', '$2,060', 'Last week'], ['Omar T.', '1', '$65', 'Sep 28']] },
    { n: 'Marketing & Growth', ic: 'Megaphone', copy: 'Plan campaigns, manage social and listings, and see what competitors are doing.', m: [['Marketing & Campaigns', '/platform/marketing-campaigns', 'Megaphone'], ['Social Media Management', '/platform/social-media', 'Share2'], ['Advertising', '/platform/advertising', 'Target'], ['Business Listings', '/platform/business-listings', 'MapPin'], ['Competitive Insights', '/platform/competitive-insights', 'Radar']], screen: 'Campaigns', cols: ['Campaign', 'Channel', 'Audience', 'Status'], rows: [['Autumn rebook', 'WhatsApp', 'Lapsed 60d', 'Scheduled'], ['New colour menu', 'Instagram', 'All', 'Live'], ['Review push', 'Email', 'Last 30d', 'Sent'], ['Referral offer', 'WhatsApp', 'Top 50', 'Draft']] },
    { n: 'Finance & Operations', ic: 'Landmark', copy: 'Know your real profit, track customer credit and keep payments and purchasing in order.', m: [['Credit', '/platform/credit', 'NotebookPen'], ['Profit & Analytics', '/platform/profit-analytics', 'TrendingUp'], ['Finance & Accounting', '/platform/finance-accounting', 'Landmark'], ['Payments & Billing', '/platform/payments-billing', 'CreditCard'], ['Procurement', '/platform/procurement', 'ClipboardList']], screen: 'Credit', cols: ['Customer', 'Owed', 'Due', 'Status'], rows: [['Kashif Traders', '$320', 'Oct 10', 'Reminder sent'], ['Hina S.', '$45', 'Oct 12', 'Open'], ['Star Cafe', '$210', 'Oct 3', 'Overdue'], ['Bilal R.', '$65', 'Oct 15', 'Open']] },
    { n: 'People & Field Operations', ic: 'UsersRound', copy: 'Schedule staff, run branches, dispatch riders and manage jobs in the field.', m: [['Staff', '/platform/staff', 'UsersRound'], ['Branches', '/platform/branches', 'Building2'], ['Delivery & Riders', '/platform/delivery-riders', 'Bike'], ['Field Service & Work Orders', '/platform/field-service', 'Wrench'], ['Assets & Maintenance', '/platform/assets-maintenance', 'PackageCheck'], ['People & Payroll', '/platform/people-payroll', 'Wallet']], screen: 'Work orders', cols: ['Job', 'Technician', 'Window', 'Status'], rows: [['WO-118 AC service', 'Imran', '9–11 AM', 'On site'], ['WO-119 Leak fix', 'Danish', '11–1 PM', 'En route'], ['WO-120 Install', 'Imran', '2–4 PM', 'Scheduled'], ['WO-121 Inspection', 'Sana', '4–5 PM', 'Scheduled']] },
    { n: 'Platform & Automation', ic: 'Workflow', copy: 'Dashboards, reports, integrations and automations that hold everything together.', m: [['Dashboard', '/platform/dashboard', 'LayoutDashboard'], ['Reports', '/platform/reports', 'ChartNoAxesCombined'], ['Settings', '/platform/settings', 'Settings'], ['Integrations', '/platform/integrations', 'Plug'], ['Projects & Tasks', '/platform/projects-tasks', 'ListChecks'], ['Automations & Workflows', '/platform/automations-workflows', 'Workflow'], ['Documents, Contracts & eSign', '/platform/documents-esign', 'Signature']], screen: 'Automations', cols: ['Workflow', 'Trigger', 'Last run', 'Status'], rows: [['Booking reminder', 'Booking created', '4:12 PM', 'On'], ['Review request', 'Visit completed', '3:50 PM', 'On'], ['Overdue invoice', '7 days unpaid', '9:00 AM', 'On'], ['Low stock reorder', 'Stock < 5', 'Yesterday', 'Approval']] },
    { n: 'AI & Intelligence', ic: 'Sparkles', copy: 'AI that works on the connected record, with permissions and approvals built in.', m: [['AI Assistant', '/ai/assistant', 'Sparkles'], ['AI Phone Receptionist', '/ai/phone-receptionist', 'PhoneCall'], ['AI Photo Digitizer', '/ai/photo-digitizer', 'ScanText'], ['Business Intelligence', '/ai/business-intelligence', 'ChartColumn'], ['SEO Autopilot', '/ai/seo-autopilot', 'Search'], ['Autonomous Commerce', '/ai/autonomous-commerce', 'Bot']], screen: 'AI activity', cols: ['Action', 'Source', 'Approval', 'Status'], rows: [['Booked Fri 4:30', 'Phone call', 'Not needed', 'Done'], ['12 ledger rows', 'Photo', 'Reviewed', 'Saved'], ['Meta titles', 'SEO', 'Pending', 'Draft'], ['Bundle offer', 'Commerce', 'Pending', 'Draft']] },
  ];
  IMG = {"beauty-personal-care":["photo-1580618672591-eb180b1a973f","Hairstylist blow-drying a client in a salon","Adam Winger"],"restaurants-food":["photo-1622021142947-da7dedc7c39a","Chef chopping vegetables in a restaurant kitchen","Pylyp Sukhenko"],"retail-local-commerce":["photo-1556741533-6e6a62bd8b49","Customer paying at a shop counter","Christiann Koepke"],"automotive":["photo-1615906655593-ad0386982a0f","Mechanic working on a car engine","Sten Rademaker"],"healthcare-clinics":["photo-1519494026892-80bbd2d6fd0d","Clinic lobby with reception signage","Martha Dominguez de Gouveia"],"home-field-services":["photo-1637640125496-31852f042a60","Technician tool box with wrenches","Isabela Kronemberger"],"fitness-wellness":["photo-1534438327276-14e5300c3a48","Gym with training equipment","Unsplash"],"real-estate-property":["photo-1652803723541-ffc5a8783329","Bright office with a marble front counter","Paul Kansonkho"],"cafes-coffee":["photo-1495474472287-4d71bcdd2085","Barista at a café counter","Unsplash"],"bakeries":["photo-1509440159596-0249088772ff","Fresh bread on bakery shelves","Unsplash"],"grocery-supermarkets":["photo-1542838132-92c53300491e","Grocery store aisle","Unsplash"],"pharmacies":["photo-1587854692152-cbe660dbde88","Pharmacy shelves with medicine","Unsplash"],"dental-clinics":["photo-1606811971618-4486d14f3f99","Dentist treating a patient","Unsplash"],"opticians":["photo-1574258495973-f010dfbb5371","Glasses on display in an optical store","Unsplash"],"fashion-apparel":["photo-1441986300917-64674bd600d8","Clothing rack in a boutique","Unsplash"],"jewellery":["photo-1515562141207-7a88fb7ce338","Jewellery in a display case","Unsplash"],"electronics-mobile":["photo-1511707171634-5f897ff02aa9","Phones on display in an electronics shop","Unsplash"],"furniture-home-decor":["photo-1555041469-a586c61ea9bc","Furniture showroom","Unsplash"],"pet-care-grooming":["photo-1516734212186-a967f81ad0d7","Dog being groomed","Unsplash"],"veterinary-clinics":["photo-1628009368231-7bb7cfcb0def","Vet examining a dog","Unsplash"],"education-tutoring":["photo-1503676260728-1c00da094a0b","Teacher with students in a classroom","Unsplash"],"hotels-guest-houses":["photo-1566073771259-6a8506099945","Hotel reception desk","Unsplash"],"travel-agencies":["photo-1436491865332-7a61a109cc05","Travellers at an airport","Unsplash"],"logistics-courier":["photo-1586528116311-ad8dd3c8310d","Delivery truck being loaded","Unsplash"],"wholesale-distribution":["photo-1553413077-190dd305871c","Warehouse with stocked shelves","Unsplash"],"manufacturing":["photo-1565043666747-69f6646db940","Workers on a factory floor","Unsplash"],"construction-contractors":["photo-1504307651254-35680f356dfd","Construction worker on site","Unsplash"],"cleaning-services":["photo-1581578731548-c64695cc6952","Cleaner wiping a surface","Unsplash"],"laundry-dry-cleaning":["photo-1545173168-9f1947eebb7f","Laundromat with washing machines","Unsplash"],"photography-studios":["photo-1452587925148-ce544e77e70d","Photographer in a studio","Unsplash"],"events-weddings":["photo-1519741497674-611481863552","Decorated wedding venue","Unsplash"],"florists":["photo-1487070183336-b863922373d4","Florist arranging flowers","Unsplash"],"printing-signage":["photo-1562564055-71e051d33c19","Printing press in a print shop","Unsplash"],"law-firms":["photo-1589829545856-d10d557cf95f","Lawyer working at a desk","Unsplash"],"accounting-consulting":["photo-1554224155-6726b3ff858f","Accountant reviewing documents","Unsplash"],"spa-massage":["photo-1544161515-4ab6ce6db874","Massage treatment at a spa","Unsplash"],"car-rental":["photo-1449965408869-eaa3f722e40d","Rental cars in a parking lot","Unsplash"],"bicycle-shops":["photo-1485965120184-e220f721d03e","Mechanic repairing a bicycle","Unsplash"],"tailors-alterations":["photo-1594938298603-c8148c4dae35","Tailor measuring fabric","Unsplash"],"nail-salons":["photo-1604654894610-df63bc536371","Manicure in a nail salon","Unsplash"],"tattoo-studios":["photo-1611501275019-9b5cda994e8d","Tattoo artist at work","Unsplash"],"yoga-pilates":["photo-1544367567-0f2fcb009e0b","Yoga class in a studio","Unsplash"],"dance-martial-arts":["photo-1508700929628-666bc8bd84ea","Dancers in a studio","Unsplash"],"physiotherapy":["photo-1576091160550-2173dba999ef","Clinician with a patient","Unsplash"],"labs-diagnostics":["photo-1579154204601-01588f351e67","Laboratory samples","Unsplash"],"home-healthcare":["photo-1576765608535-5f04d1e3f289","Caregiver with an elderly patient","Unsplash"],"daycare-preschools":["photo-1587654780291-39c9404d746b","Colourful toys in a playroom","Unsplash"],"driving-schools":["photo-1494976388531-d1058494cdd8","Car on an open road","Unsplash"],"bookstores-stationery":["photo-1507842217343-583bb7270b66","Shelves full of books","Unsplash"],"toy-stores":["photo-1566576912321-d58ddd7a6088","Toys on display","Unsplash"],"sports-goods":["photo-1517649763962-0c623066013b","Athletes on a track","Unsplash"],"hardware-stores":["photo-1581783898377-1c85bf937427","Tools hanging in a hardware store","Unsplash"],"garden-centres":["photo-1416879595882-3373a0480b5b","Potted plants in a nursery","Unsplash"],"butchers":["photo-1607623814075-e51df1bdc82f","Butcher counter with fresh cuts","Unsplash"],"fruit-vegetable":["photo-1610832958506-aa56368176cf","Fresh fruit and vegetables","Unsplash"],"sweets-confectionery":["photo-1499636136210-6f4ee915583e","Fresh cookies on a tray","Unsplash"],"food-trucks":["photo-1565123409695-7b5ef63a2efb","Food truck serving customers","Unsplash"],"catering":["photo-1555244162-803834f70033","Catering buffet at an event","Unsplash"],"cloud-kitchens":["photo-1556909114-f6e7ad7d3136","Busy commercial kitchen","Unsplash"],"bars-lounges":["photo-1514933651103-005eec06c04b","Bar counter with bottles","Unsplash"],"ice-cream-desserts":["photo-1501443762994-82bd5dace89a","Ice cream cones","Unsplash"],"juice-bars":["photo-1600271886742-f049cd451bba","Fresh juices on a counter","Unsplash"],"tyre-battery":["photo-1486262715619-67b85e0b08d3","Mechanic in a garage","Unsplash"],"car-wash-detailing":["photo-1520340356584-f9917d1eea6f","Car being washed","Unsplash"],"petrol-stations":["photo-1545262810-77515befe149","Fuel pumps at a petrol station","Unsplash"],"property-management":["photo-1560518883-ce09059eeffa","House keys handed over","Unsplash"],"coworking-spaces":["photo-1497366216548-37526070297c","Bright shared office","Unsplash"],"recruitment-agencies":["photo-1521737604893-d14cc237f11d","Team meeting around a table","Unsplash"],"marketing-agencies":["photo-1552664730-d307ca884978","Agency team planning","Unsplash"],"it-computer-repair":["photo-1517694712202-14dd9538aa97","Laptop on a desk","Unsplash"],"security-services":["photo-1557597774-9d273605dfa9","Security camera on a wall","Unsplash"],"pest-control":["photo-1563453392212-326f5e854473","Technician spraying","Unsplash"],"plumbing-electrical":["photo-1621905251189-08b45d6a269e","Electrician working on wiring","Unsplash"],"movers-packers":["photo-1600518464441-9154a4dea21b","Moving boxes in a room","Unsplash"],"interior-design":["photo-1618221195710-dd6b41faaea6","Designed living room interior","Unsplash"],"gaming-entertainment":["photo-1542751371-adc38448a05e","Gaming setup with lights","Unsplash"],"cinemas-venues":["photo-1489599849927-2ee91cede3ba","Cinema seats facing a screen","Unsplash"],"nonprofits-charities":["photo-1488521787991-ed7bbaae773c","Volunteers helping","Unsplash"],"barbershops":["photo-1503951914875-452162b0f3f1","Barber trimming a client’s hair","Unsplash"],"makeup-artists":["photo-1487412947147-5cebf100ffc2","Makeup brushes and products","Unsplash"],"bridal-boutiques":["photo-1594552072238-b8a33785b261","Wedding dresses on display","Unsplash"],"shoe-stores":["photo-1460353581641-37baddab0fa2","Sneakers on display","Unsplash"],"watches-accessories":["photo-1523275335684-37898b6baf30","Wristwatch close-up","Unsplash"],"cosmetics-perfume":["photo-1541643600914-78b084683601","Perfume bottles","Unsplash"],"home-appliances":["photo-1556911220-bff31c812dba","Modern kitchen appliances","Unsplash"],"paint-building-materials":["photo-1562259949-e8e7689d7828","Paint cans and brushes","Unsplash"],"textile-fabric":["photo-1558769132-cb1aea458c5e","Rolls of colourful fabric","Unsplash"],"gift-shops":["photo-1513885535751-8b9238bd345a","Wrapped gift boxes","Unsplash"],"organic-health-food":["photo-1488459716781-31db52582fe9","Fresh produce at a market","Unsplash"],"pizza-shops":["photo-1513104890138-7c749659a591","Fresh pizza","Unsplash"],"burgers-fast-food":["photo-1568901346375-23c9450c58cd","Burger on a board","Unsplash"],"tea-houses":["photo-1544787219-7f47ccb76574","Tea being poured","Unsplash"],"breweries-taprooms":["photo-1535958636474-b021ee887b13","Beer glasses at a taproom","Unsplash"],"hostels-homestays":["photo-1555854877-bab0e564b8d5","Hostel dorm beds","Unsplash"],"tour-operators":["photo-1469854523086-cc02fe5d8800","Road trip through mountains","Unsplash"],"golf-sports-clubs":["photo-1535131749006-b7f58c99034b","Golf course green","Unsplash"],"swimming-aquatics":["photo-1576013551627-0cc20b96c2a7","Swimming pool lanes","Unsplash"],"music-schools":["photo-1511379938547-c1f69419868d","Musical instruments","Unsplash"],"art-studios":["photo-1513364776144-60967b0f800f","Paints and brushes in a studio","Unsplash"],"coaching-centres":["photo-1427504494785-3a9ca7044f45","Students in a lecture hall","Unsplash"],"hospitals":["photo-1586773860418-d37222d8fce3","Hospital corridor","Unsplash"],"dermatology-aesthetics":["photo-1570172619644-dfd03ed5d881","Skincare treatment","Unsplash"],"counselling-therapy":["photo-1573497019940-1c28c88b4f3e","Counsellor in an office","Unsplash"],"nutrition-dietitians":["photo-1490645935967-10de6ba17061","Healthy meal bowl","Unsplash"],"pet-shops":["photo-1583337130417-3346a1be7dee","Happy dog","Unsplash"],"farms-agriculture":["photo-1500382017468-9049fed747ef","Farm fields at sunset","Unsplash"],"dairy-shops":["photo-1550583724-b2692b85b150","Bottles of milk","Unsplash"],"auto-parts":["photo-1487754180451-c456f719a1fc","Car engine parts","Unsplash"],"motorcycle-dealers":["photo-1558981806-ec527fa84c39","Motorcycle parked outside","Unsplash"],"car-dealerships":["photo-1492144534655-ae79c964c9d7","Car in a showroom","Unsplash"],"solar-energy":["photo-1509391366360-2e959784a276","Solar panels on a roof","Unsplash"],"architecture-firms":["photo-1503387762-592deb58ef4e","Architectural plans on a desk","Unsplash"],"insurance-agencies":["photo-1450101499163-c8848c66ca85","Signing documents","Unsplash"],"finance-microlending":["photo-1554224154-26032ffc0d07","Finance documents and calculator","Unsplash"],"banquet-halls":["photo-1464366400600-7168b8af9bc3","Banquet hall set for an event","Unsplash"],"dj-sound-rental":["photo-1470225620780-dba8ba36b745","DJ at a mixing desk","Unsplash"],"equipment-rental":["photo-1504148455328-c376907d081c","Tools on a workbench","Unsplash"],"online-brands":["photo-1556742049-0cfed4f6a45d","Paying online with a card","Unsplash"]};
  INT = [
    { n: 'WhatsApp', logo: 'https://cdn.simpleicons.org/whatsapp', short: 'Messages', flows: ['Customer messages', 'Booking confirmations', 'Nightly Close delivery'] },
    { n: 'Shopify', logo: 'https://cdn.simpleicons.org/shopify', short: 'Orders', flows: ['Online orders', 'Products & stock', 'Customer information'] },
    { n: 'WooCommerce', logo: 'https://cdn.simpleicons.org/woocommerce', short: 'Orders', flows: ['Online orders', 'Products & stock', 'Customer information'] },
    { n: 'QuickBooks', logo: 'https://cdn.simpleicons.org/quickbooks', short: 'Accounting', flows: ['Invoices', 'Payments', 'Accounting data'] },
    { n: 'PayPal', logo: 'https://cdn.simpleicons.org/paypal', short: 'Payments', flows: ['Payments', 'Refunds', 'Payouts'] },
    { n: 'Meta', logo: 'https://cdn.simpleicons.org/meta', short: 'Marketing', flows: ['Messenger & Instagram messages', 'Ad leads', 'Marketing events'] },
    { n: 'WordPress', logo: 'https://cdn.simpleicons.org/wordpress', short: 'Website', flows: ['Booking widgets', 'Lead forms', 'SEO pages'] },
    { n: 'Google', logo: 'https://cdn.simpleicons.org/google', short: 'Listings', flows: ['Business listings', 'Reviews', 'Calendar sync'] },
  ];
  IND = [
    ['Retail & Local Commerce', 'retail-local-commerce', 'Store', 'Sell in-store and online while keeping products, customers and stock connected.', ['Fast Sale', 'Inventory', 'Customers', 'Website & Commerce', 'Profit & Analytics']],
    ['Automotive', 'automotive', 'Car', 'Workshops and service centres managing jobs, parts and customers.', ['Bookings', 'Field Service', 'Inventory', 'Orders', 'Customers']],
    ['Healthcare & Clinics', 'healthcare-clinics', 'Stethoscope', 'Clinics handling appointments, reminders and patient payments.', ['Bookings', 'Customer Portal', 'Unified Inbox', 'Payments & Billing', 'Staff']],
    ['Home & Field Services', 'home-field-services', 'House', 'Teams quoting, scheduling and getting paid onsite.', ['Quotes & Orders', 'Field Service', 'Staff', 'Payments & Billing', 'Reviews & Reputation']],
    ['Beauty & Personal Care', 'beauty-personal-care', 'Scissors', 'Salons, spas and barbers that run on appointments.', ['Bookings', 'Customers', 'Unified Inbox', 'Payments & Billing', 'Reviews & Reputation']],
    ['Restaurants & Food', 'restaurants-food', 'UtensilsCrossed', 'Counters, kitchens and delivery working from one menu.', ['Fast Sale', 'Orders', 'Inventory', 'Customers', 'Profit & Analytics']],
    ['Fitness & Wellness', 'fitness-wellness', 'Dumbbell', 'Studios and gyms running classes and memberships.', ['Bookings', 'Customers', 'Payments & Billing', 'Marketing & Campaigns', 'Staff']],
    ['Real Estate & Property', 'real-estate-property', 'Building', 'Agents and managers handling leads, viewings and contracts.', ['Customers', 'Projects & Tasks', 'Documents & eSign', 'Unified Inbox', 'Payments & Billing']],
    ["Cafés & Coffee Shops","cafes-coffee","Coffee","Cafés serving fast at the counter and building regulars.",["Fast Sale","Loyalty","Inventory","Reviews","Reporting"]],
    ["Bakeries","bakeries","Croissant","Bakeries tracking daily batches, orders and waste.",["Fast Sale","Orders","Inventory","Credit","Profit & Analytics"]],
    ["Grocery & Supermarkets","grocery-supermarkets","ShoppingBasket","Stores with thousands of items and fast checkout lines.",["Fast Sale","Inventory","Purchasing","Credit","Reporting"]],
    ["Pharmacies","pharmacies","Pill","Pharmacies managing stock, batches and repeat customers.",["Fast Sale","Inventory","Customers (CRM)","Reminders","Reporting"]],
    ["Dental Clinics","dental-clinics","Smile","Dental practices filling chairs and cutting no-shows.",["Bookings","Reminders","Payments","Customer Portal","Reviews"]],
    ["Opticians","opticians","Eye","Optical stores handling eye tests, frames and orders.",["Bookings","Fast Sale","Orders","Customers (CRM)","Follow-up"]],
    ["Fashion & Apparel","fashion-apparel","Shirt","Boutiques selling sizes and colours in-store and online.",["Fast Sale","Inventory","Website & Commerce","Campaigns","Loyalty"]],
    ["Jewellery","jewellery","Gem","Jewellers tracking high-value stock, orders and repairs.",["Fast Sale","Inventory","Orders","Credit","Customers (CRM)"]],
    ["Electronics & Mobile Shops","electronics-mobile","Smartphone","Shops selling devices, accessories and repairs.",["Fast Sale","Inventory","Work orders","Warranty","Credit"]],
    ["Furniture & Home Decor","furniture-home-decor","Sofa","Showrooms handling quotes, custom orders and delivery.",["Quotes","Orders","Inventory","Dispatch","Payments"]],
    ["Pet Care & Grooming","pet-care-grooming","PawPrint","Groomers and pet shops booking visits and selling supplies.",["Bookings","Fast Sale","Reminders","Customers (CRM)","Reviews"]],
    ["Veterinary Clinics","veterinary-clinics","HeartPulse","Vet clinics managing appointments, records and vaccines.",["Bookings","Reminders","Payments","Customer Portal","Staff"]],
    ["Education & Tutoring","education-tutoring","GraduationCap","Academies and tutors managing classes, fees and parents.",["Bookings","Payments & Billing","Unified Inbox","Customer Portal","Staff"]],
    ["Hotels & Guest Houses","hotels-guest-houses","Hotel","Hotels handling reservations, guests and services.",["Bookings","Payments","Unified Inbox","Reviews","Staff"]],
    ["Travel Agencies","travel-agencies","Plane","Agencies selling packages, tickets and visa services.",["Customers (CRM)","Quotes","Payments","Documents & eSign","Unified Inbox"]],
    ["Logistics & Courier","logistics-courier","Truck","Couriers dispatching riders and tracking every delivery.",["Dispatch","Orders","Field Service","Payments","Reporting"]],
    ["Wholesale & Distribution","wholesale-distribution","Warehouse","Distributors managing bulk orders, credit and routes.",["Orders","Inventory","Credit","Purchasing","Dispatch"]],
    ["Manufacturing","manufacturing","Factory","Small manufacturers tracking materials, jobs and costs.",["Inventory","Work orders","Purchasing","Profit & Analytics","Staff"]],
    ["Construction & Contractors","construction-contractors","HardHat","Contractors quoting jobs and managing crews on site.",["Quotes","Field Service","Tasks","Invoices","Documents & eSign"]],
    ["Cleaning Services","cleaning-services","Sparkles","Cleaning teams booking visits and dispatching staff.",["Bookings","Dispatch","Field Service","Payments","Reviews"]],
    ["Laundry & Dry Cleaning","laundry-dry-cleaning","WashingMachine","Laundries tracking orders from drop-off to pickup.",["Orders","Fast Sale","Reminders","Credit","Customer messaging"]],
    ["Photography Studios","photography-studios","Camera","Studios booking shoots and delivering client work.",["Bookings","Quotes","Payments","Documents & eSign","Reviews"]],
    ["Events & Weddings","events-weddings","PartyPopper","Planners managing clients, vendors and payment schedules.",["Customers (CRM)","Quotes","Payments & Billing","Tasks","Unified Inbox"]],
    ["Florists","florists","Flower2","Flower shops taking orders and same-day deliveries.",["Orders","Fast Sale","Dispatch","Website & Commerce","Reviews"]],
    ["Printing & Signage","printing-signage","Printer","Print shops quoting jobs and tracking production.",["Quotes","Work orders","Invoices","Credit","Customers (CRM)"]],
    ["Law Firms","law-firms","Scale","Firms managing clients, matters, documents and billing.",["Customers (CRM)","Documents & eSign","Bookings","Invoices","Tasks"]],
    ["Accounting & Consulting","accounting-consulting","Calculator","Advisors managing clients, deadlines and retainers.",["Customers (CRM)","Tasks","Payments & Billing","Documents & eSign","Unified Inbox"]],
    ["Spa & Massage","spa-massage","Leaf","Spas selling treatments, packages and gift cards.",["Bookings","Payments","Loyalty","Reminders","Reviews"]],
    ["Car Rental","car-rental","Key","Rental desks managing fleet, bookings and deposits.",["Bookings","Payments","Documents & eSign","Customers (CRM)","Reporting"]],
    ["Bicycle Shops & Repair","bicycle-shops","Bike","Bike shops selling, servicing and booking repairs.",["Fast Sale","Work orders","Bookings","Inventory","Follow-up"]],
    ["Tailors & Alterations","tailors-alterations","Ruler","Tailors tracking measurements, fittings and pickups.",["Orders","Bookings","Reminders","Customers (CRM)","Payments"]],
    ["Nail Salons","nail-salons","Hand","Nail studios booking chairs and selling add-ons.",["Bookings","Reminders","Fast Sale","Loyalty","Reviews"]],
    ["Tattoo Studios","tattoo-studios","PenTool","Studios managing deposits, consults and long sessions.",["Bookings","Payments","Documents & eSign","Customers (CRM)","Reviews"]],
    ["Yoga & Pilates","yoga-pilates","Flower","Studios running classes, packs and memberships.",["Bookings","Payments & Billing","Customers (CRM)","Campaigns","Staff"]],
    ["Dance & Martial Arts","dance-martial-arts","Music","Academies managing batches, fees and attendance.",["Bookings","Payments & Billing","Unified Inbox","Customers (CRM)","Staff"]],
    ["Physiotherapy","physiotherapy","Activity","Clinics booking sessions and tracking treatment plans.",["Bookings","Reminders","Payments","Customers (CRM)","Staff"]],
    ["Labs & Diagnostics","labs-diagnostics","FlaskConical","Labs handling sample bookings, reports and payments.",["Bookings","Orders","Documents & eSign","Payments","Reminders"]],
    ["Home Healthcare","home-healthcare","HeartHandshake","Care providers scheduling visits and caregivers.",["Bookings","Dispatch","Field Service","Payments & Billing","Staff"]],
    ["Daycare & Preschools","daycare-preschools","Baby","Centres managing enrolments, fees and parent updates.",["Payments & Billing","Unified Inbox","Customers (CRM)","Staff","Reminders"]],
    ["Driving Schools","driving-schools","CarFront","Schools booking lessons, instructors and test dates.",["Bookings","Staff","Payments & Billing","Reminders","Customers (CRM)"]],
    ["Bookstores & Stationery","bookstores-stationery","BookOpen","Shops selling thousands of titles and school supplies.",["Fast Sale","Inventory","Purchasing","Website & Commerce","Loyalty"]],
    ["Toy Stores","toy-stores","Puzzle","Toy shops handling seasonal stock and gift orders.",["Fast Sale","Inventory","Website & Commerce","Campaigns","Loyalty"]],
    ["Sports Goods","sports-goods","Trophy","Stores selling gear, team kits and bulk school orders.",["Fast Sale","Inventory","Quotes","Orders","Credit"]],
    ["Hardware Stores","hardware-stores","Hammer","Hardware shops with huge catalogues and trade credit.",["Fast Sale","Inventory","Credit","Purchasing","Quotes"]],
    ["Garden Centres & Nurseries","garden-centres","Sprout","Nurseries selling plants, supplies and landscaping.",["Fast Sale","Inventory","Quotes","Field Service","Dispatch"]],
    ["Butchers & Meat Shops","butchers","Beef","Meat shops tracking weight-based stock and orders.",["Fast Sale","Inventory","Orders","Credit","Dispatch"]],
    ["Fruit & Vegetable Shops","fruit-vegetable","Apple","Produce sellers managing daily stock and wastage.",["Fast Sale","Inventory","Credit","Orders","Profit & Analytics"]],
    ["Sweets & Confectionery","sweets-confectionery","Cookie","Sweet shops handling festive orders and walk-ins.",["Fast Sale","Orders","Inventory","Dispatch","Campaigns"]],
    ["Food Trucks","food-trucks","Sandwich","Mobile kitchens selling fast with location updates.",["Fast Sale","Inventory","Campaigns","Reviews","Reporting"]],
    ["Catering","catering","ChefHat","Caterers quoting events and planning menus and staff.",["Quotes","Orders","Payments & Billing","Staff","Tasks"]],
    ["Cloud Kitchens","cloud-kitchens","CookingPot","Delivery-only kitchens running several brands at once.",["Orders","Inventory","Dispatch","Reporting","Profit & Analytics"]],
    ["Bars & Lounges","bars-lounges","Wine","Venues managing tabs, reservations and stock.",["Fast Sale","Bookings","Inventory","Staff","Reporting"]],
    ["Ice Cream & Desserts","ice-cream-desserts","IceCreamCone","Dessert shops serving fast with seasonal menus.",["Fast Sale","Inventory","Loyalty","Reviews","Reporting"]],
    ["Juice & Smoothie Bars","juice-bars","CupSoda","Juice bars tracking fresh stock and loyal regulars.",["Fast Sale","Inventory","Loyalty","Campaigns","Reviews"]],
    ["Tyre & Battery Shops","tyre-battery","CircleDot","Shops fitting parts and tracking warranties.",["Fast Sale","Work orders","Inventory","Bookings","Follow-up"]],
    ["Car Wash & Detailing","car-wash-detailing","Droplets","Car washes selling packages and memberships.",["Bookings","Fast Sale","Loyalty","Reviews","Staff"]],
    ["Petrol Stations","petrol-stations","Fuel","Stations with forecourt, shop and fleet credit.",["Fast Sale","Inventory","Credit","Staff","Reporting"]],
    ["Property Management","property-management","KeyRound","Managers collecting rent and handling maintenance.",["Payments & Billing","Field Service","Tasks","Documents & eSign","Unified Inbox"]],
    ["Co-working Spaces","coworking-spaces","Laptop","Spaces selling desks, rooms and memberships.",["Bookings","Payments & Billing","Customers (CRM)","Unified Inbox","Reporting"]],
    ["Recruitment Agencies","recruitment-agencies","UserSearch","Agencies tracking candidates, clients and placements.",["Customers (CRM)","Tasks","Documents & eSign","Unified Inbox","Payments & Billing"]],
    ["Marketing Agencies","marketing-agencies","Megaphone","Agencies managing clients, retainers and campaigns.",["Customers (CRM)","Tasks","Payments & Billing","Campaigns","Documents & eSign"]],
    ["IT & Computer Repair","it-computer-repair","Cpu","Repair shops logging devices, parts and pickups.",["Work orders","Inventory","Fast Sale","Reminders","Reviews"]],
    ["Security Services","security-services","ShieldCheck","Firms scheduling guards, sites and contracts.",["Staff","Dispatch","Documents & eSign","Payments & Billing","Tasks"]],
    ["Pest Control","pest-control","Bug","Teams booking treatments and recurring visits.",["Bookings","Dispatch","Field Service","Reminders","Payments"]],
    ["Plumbing & Electrical","plumbing-electrical","Plug","Tradespeople quoting jobs and getting paid on site.",["Quotes","Field Service","Dispatch","Payments","Reviews"]],
    ["Movers & Packers","movers-packers","PackageOpen","Movers quoting moves and scheduling crews.",["Quotes","Bookings","Dispatch","Payments","Reviews"]],
    ["Interior Design","interior-design","Lamp","Designers managing projects, vendors and approvals.",["Quotes","Tasks","Documents & eSign","Payments & Billing","Customers (CRM)"]],
    ["Gaming & Entertainment Zones","gaming-entertainment","Gamepad2","Venues selling slots, passes and party packages.",["Bookings","Fast Sale","Loyalty","Campaigns","Reporting"]],
    ["Cinemas & Venues","cinemas-venues","Clapperboard","Venues selling tickets, snacks and private bookings.",["Bookings","Fast Sale","Inventory","Campaigns","Reporting"]],
    ["Non-profits & Charities","nonprofits-charities","HandHeart","Organisations managing donors, events and volunteers.",["Customers (CRM)","Payments & Billing","Campaigns","Tasks","Reporting"]],
    ["Barbershops","barbershops","Scissors","Barbers filling chairs with walk-ins and bookings.",["Bookings","Reminders","Fast Sale","Loyalty","Reviews"]],
    ["Makeup Artists","makeup-artists","Brush","Artists booking events, deposits and trials.",["Bookings","Payments","Unified Inbox","Customers (CRM)","Reviews"]],
    ["Bridal Boutiques","bridal-boutiques","Crown","Boutiques managing fittings, orders and balances.",["Bookings","Orders","Payments & Billing","Customers (CRM)","Reminders"]],
    ["Shoe Stores","shoe-stores","Footprints","Shoe shops tracking every size and colour.",["Fast Sale","Inventory","Website & Commerce","Loyalty","Campaigns"]],
    ["Watches & Accessories","watches-accessories","Watch","Stores selling high-value items with warranties.",["Fast Sale","Inventory","Warranty","Credit","Customers (CRM)"]],
    ["Cosmetics & Perfume","cosmetics-perfume","SprayCan","Beauty retailers with fast-moving stock and offers.",["Fast Sale","Inventory","Loyalty","Campaigns","Website & Commerce"]],
    ["Home Appliances","home-appliances","Refrigerator","Dealers selling, installing and servicing appliances.",["Fast Sale","Credit","Dispatch","Warranty","Field Service"]],
    ["Paint & Building Materials","paint-building-materials","PaintBucket","Suppliers handling trade credit and bulk orders.",["Fast Sale","Inventory","Credit","Quotes","Dispatch"]],
    ["Textile & Fabric Shops","textile-fabric","Layers","Fabric sellers tracking rolls, metres and credit.",["Fast Sale","Inventory","Credit","Orders","Purchasing"]],
    ["Gift Shops","gift-shops","Gift","Gift stores handling seasonal rushes and wrapping orders.",["Fast Sale","Inventory","Orders","Website & Commerce","Campaigns"]],
    ["Organic & Health Food","organic-health-food","Salad","Health stores selling fresh, packaged and subscription items.",["Fast Sale","Inventory","Payments & Billing","Loyalty","Website & Commerce"]],
    ["Pizza Shops","pizza-shops","Pizza","Pizzerias taking counter, phone and delivery orders.",["Fast Sale","Orders","Dispatch","Inventory","Loyalty"]],
    ["Burgers & Fast Food","burgers-fast-food","Drumstick","Quick-service outlets serving fast at peak hours.",["Fast Sale","Orders","Inventory","Dispatch","Reporting"]],
    ["Tea Houses","tea-houses","Leaf","Tea shops building regulars with quick service.",["Fast Sale","Inventory","Loyalty","Reviews","Reporting"]],
    ["Breweries & Taprooms","breweries-taprooms","Beer","Taprooms managing batches, kegs and events.",["Fast Sale","Inventory","Bookings","Purchasing","Reporting"]],
    ["Hostels & Homestays","hostels-homestays","BedDouble","Small stays managing rooms, guests and payments.",["Bookings","Payments","Unified Inbox","Reviews","Staff"]],
    ["Tour Operators","tour-operators","Map","Operators selling trips, seats and guides.",["Bookings","Payments & Billing","Documents & eSign","Unified Inbox","Staff"]],
    ["Golf & Sports Clubs","golf-sports-clubs","Flag","Clubs managing members, tee times and events.",["Bookings","Payments & Billing","Customers (CRM)","Campaigns","Staff"]],
    ["Swimming & Aquatics","swimming-aquatics","Waves","Pools running lessons, passes and memberships.",["Bookings","Payments & Billing","Reminders","Staff","Customers (CRM)"]],
    ["Music Schools","music-schools","Guitar","Schools scheduling lessons, teachers and fees.",["Bookings","Payments & Billing","Staff","Unified Inbox","Reminders"]],
    ["Art Studios & Classes","art-studios","Palette","Studios selling classes, workshops and materials.",["Bookings","Fast Sale","Payments & Billing","Campaigns","Customers (CRM)"]],
    ["Coaching Centres","coaching-centres","School","Centres managing batches, fees and test results.",["Payments & Billing","Unified Inbox","Customers (CRM)","Staff","Reminders"]],
    ["Hospitals","hospitals","Hospital","Hospitals coordinating departments, billing and patients.",["Bookings","Payments & Billing","Staff","Documents & eSign","Reporting"]],
    ["Dermatology & Aesthetics","dermatology-aesthetics","Sparkle","Clinics selling treatments, packages and follow-ups.",["Bookings","Reminders","Payments & Billing","Follow-up","Reviews"]],
    ["Counselling & Therapy","counselling-therapy","Brain","Practices handling private sessions and billing.",["Bookings","Reminders","Payments & Billing","Documents & eSign","Customers (CRM)"]],
    ["Nutrition & Dietitians","nutrition-dietitians","Carrot","Dietitians running plans, check-ins and packages.",["Bookings","Payments & Billing","Unified Inbox","Follow-up","Customers (CRM)"]],
    ["Pet Shops","pet-shops","Fish","Pet stores selling food, supplies and subscriptions.",["Fast Sale","Inventory","Payments & Billing","Loyalty","Reminders"]],
    ["Farms & Agriculture","farms-agriculture","Tractor","Farms selling produce wholesale and direct.",["Orders","Inventory","Credit","Dispatch","Profit & Analytics"]],
    ["Dairy Shops","dairy-shops","Milk","Dairies running daily deliveries and monthly billing.",["Orders","Dispatch","Payments & Billing","Credit","Inventory"]],
    ["Auto Parts Stores","auto-parts","Cog","Parts stores with huge catalogues and garage credit.",["Fast Sale","Inventory","Credit","Purchasing","Orders"]],
    ["Motorcycle Dealers & Repair","motorcycle-dealers","Gauge","Dealers selling bikes and running service bays.",["Fast Sale","Work orders","Bookings","Inventory","Follow-up"]],
    ["Car Dealerships","car-dealerships","Car","Dealers managing leads, test drives and paperwork.",["Customers (CRM)","Bookings","Documents & eSign","Follow-up","Unified Inbox"]],
    ["Solar & Energy Installers","solar-energy","Sun","Installers quoting systems and managing installs.",["Quotes","Field Service","Dispatch","Payments & Billing","Warranty"]],
    ["Architecture Firms","architecture-firms","Building2","Firms managing projects, drawings and fees.",["Quotes","Tasks","Documents & eSign","Payments & Billing","Customers (CRM)"]],
    ["Insurance Agencies","insurance-agencies","Umbrella","Agents tracking policies, renewals and claims.",["Customers (CRM)","Reminders","Documents & eSign","Tasks","Unified Inbox"]],
    ["Finance & Microlending","finance-microlending","Landmark","Lenders tracking borrowers, schedules and repayments.",["Customers (CRM)","Credit","Payments & Billing","Documents & eSign","Reporting"]],
    ["Banquet Halls","banquet-halls","UtensilsCrossed","Halls managing bookings, menus and advances.",["Bookings","Quotes","Payments & Billing","Staff","Documents & eSign"]],
    ["DJ & Sound Rental","dj-sound-rental","Speaker","Rental teams booking gear, crews and events.",["Bookings","Inventory","Quotes","Dispatch","Payments"]],
    ["Equipment Rental","equipment-rental","Wrench","Rental shops tracking items out, due and returned.",["Bookings","Inventory","Documents & eSign","Payments","Reminders"]],
    ["Online Brands & E-commerce","online-brands","ShoppingBag","Online sellers running store, stock and shipping.",["Website & Commerce","Orders","Inventory","Dispatch","Campaigns"]],
  ];
  SOL = [
    ['Customers forget appointments', 'Reduce No-Shows', 'reduce-no-shows', 'CalendarCheck'],
    ['Happy customers never leave a review', 'Collect More Reviews', 'collect-more-reviews', 'ThumbsUp'],
    ['Credit lives in a notebook', 'Track Customer Credit', 'track-customer-credit', 'HandCoins'],
    ['Revenue looks good, but is it profit?', 'Know Your Real Profit', 'know-your-real-profit', 'CircleDollarSign'],
    ['Each branch runs differently', 'Run Several Locations', 'run-several-locations', 'MapPinned'],
    ['Years of records are on paper', 'Bring Paper Records In', 'bring-paper-records-in', 'FileScan'],
    ['The queue at the counter is too long', 'Fast Sale', 'fast-sale', 'Timer'],
  ];
  TRUST = [
    ['Role-based access', 'Each person sees and does only what their role allows.', 'KeyRound'],
    ['Human approval for AI', 'Consequential AI actions wait for a person to approve.', 'UserCheck'],
    ['Audit trails', 'Who changed what, and when, across the business.', 'History'],
    ['Secure integrations', 'Connections use scoped access you can revoke.', 'Plug'],
    ['Data control', 'Your business data stays yours to manage.', 'Database'],
    ['Multi-location permissions', 'Limit managers and staff to their own branch.', 'Building2'],
    ['AI transparency', 'See the context and evidence behind AI output.', 'Eye'],
    ['Exportability', 'Export your records whenever you need them.', 'Download'],
  ];
  PLANS = [
    ['Starter', 'Core tools for a business getting organised.'],
    ['Growth', 'More modules and automation for a growing team.'],
    ['Professional', 'Advanced controls and deeper AI for established businesses.'],
    ['Business', 'For several locations and larger teams.'],
  ];
  RES = [
    ['Getting Started', '/getting-started', 'Rocket', 'Set up Noxtill step by step.'],
    ['Business Guides', '/resources', 'BookOpenText', 'Practical guides for running a better business.'],
    ['Product Updates', '/product-updates', 'BellRing', "What's new in Noxtill."],
    ['Business Health Check', '/tools/business-health-check', 'HeartPulse', 'A free check of how your business is doing.'],
  ];
  FAQ = [
    ['What is Noxtill?', 'Noxtill is an AI-powered business operating system. It connects sales, customers, bookings, payments, inventory, staff, marketing and communication in one place, so every part of your business works from the same record.'],
    ['What type of businesses is Noxtill for?', 'Service, retail and field businesses of many kinds, from salons and clinics to restaurants, shops, contractors and multi-location teams.'],
    ['Can I use only the features I need?', 'Yes. Start with the modules you need today and turn on more as your business grows. Everything stays connected as you add them.'],
    ['Can Noxtill replace my current business tools?', 'Many businesses use Noxtill to bring separate tools for sales, bookings, customers and payments into one system. Where you want to keep a tool, Noxtill can connect to it through integrations.'],
    ['How does Noxtill AI work?', 'Noxtill AI works on your connected business data to answer questions, draft replies, surface insights and assist with workflows. Consequential actions can require human approval, and activity is recorded in an audit trail.'],
    ['Can Noxtill work with WhatsApp?', 'Yes. WhatsApp conversations can appear in the Unified Inbox, and Nightly Close can be delivered to WhatsApp when configured.'],
    ['Does Noxtill support multiple locations?', 'Yes. Branches, location-level permissions and location reporting let you run several sites from one account.'],
    ['Is there a free trial?', 'Yes. Noxtill offers a 14-day free trial with no card required.'],
  ];

  posRun() {
    if (this.state.pos >= 5) { this.setState({ pos: 0 }); return; }
    if (this.state.pos > 0) return;
    this.posT = [];
    if (this.rm) { this.setState({ pos: 5 }); return; }
    [1, 2, 3, 4, 5].forEach((k, i) => this.posT.push(setTimeout(() => this.setState({ pos: k }), 350 + i * 450)));
  }

  renderVals() {
    const ic = (n, s) => this.ic(n, s);
    const st = this.state, w = st.w, wide = w >= 1080, sm = w < 720, stk = w >= 1024, scMode = this.props.showcaseVisual ?? 'Screenshot slots';
    const I = { back: ic('ChevronLeft', 20), dots: ic('EllipsisVertical', 16), chevR: ic('ChevronRight', 15), clip: ic('Paperclip', 16), smile: ic('Smile', 16), send: ic('SendHorizontal', 15), phoneOff: ic('PhoneOff', 22), phoneLg: ic('Phone', 22), signal: ic('Signal', 12), wifi: ic('Wifi', 12), battery: ic('BatteryFull', 15), arrow: ic('ArrowRight', 17), arrowSm: ic('ArrowRight', 14), check: ic('Check', 17), checkSm: ic('Check', 12), checkXs: ic('Check', 11), sparkSm: ic('Sparkles', 14), wa: ic('MessageCircle', 13), waSm: ic('MessageCircle', 12), chevL: ic('ChevronLeft', 20), chevR: ic('ChevronRight', 20), shieldSm: ic('ShieldCheck', 14), phoneSm: ic('PhoneCall', 15), handoff: ic('UserRound', 13), lock: ic('Lock', 14), searchSm: ic('Search', 14), userSm: ic('UserRound', 14), plus: ic('Plus', 16) };

    // hero
    const hs = st.hs, flash = (on) => on ? { bd: 'rgba(2,176,122,.55)', bg: 'rgba(25,190,134,.08)' } : { bd: 'rgba(9,71,55,.10)', bg: '#FFFFFF' };
    const kpis = [
      Object.assign({ l: 'Sales today', v: hs >= 1 ? '$3,005' : '$2,860', d: hs === 1 ? '+$145.00' : '' }, flash(hs === 1)),
      Object.assign({ l: 'Bookings', v: '19', d: hs === 0 ? '+1 just now' : '' }, flash(hs === 0)),
      Object.assign({ l: 'Open invoices', v: hs >= 1 ? '3' : '4', d: hs === 1 ? '#1042 paid' : '' }, flash(false)),
      Object.assign({ l: 'Low stock', v: hs >= 2 ? '1 item' : '0 items', d: hs === 2 ? 'Argan oil shampoo' : '' }, flash(hs === 2)),
    ];
    const bh = [22, 30, 46, 38, 52, 60, 44, 70, 58, hs >= 1 ? 82 : 64];
    const bars = bh.map((h, i) => ({ h: h + '%', c: i === bh.length - 1 ? '#02B07A' : 'rgba(7,120,76,.22)' }));
    const feed = this.EV.slice(0, hs + 1).reverse().slice(0, 3).map(e => ({ t: e.t, d: e.d, when: e.when, ic: ic(e.ic, 13), icSm: ic(e.ic, 13) }));
    const events = this.EV.map((e, i) => ({ t: e.t, d: e.d, ic: ic(e.ic, 16), fx: e.fx, op: i === hs ? 1 : 0, ty: i === hs ? '0px' : '8px', dot: i === hs ? '#07784C' : 'rgba(9,71,55,.18)', dotW: i === hs ? '26px' : '8px', pressed: i === hs ? 'true' : 'false', go: () => { clearInterval(this.tHero); this.setState({ hs: i }); } }));
    const sideIcons = ['LayoutDashboard', 'CalendarDays', 'Users', 'ScanLine', 'Boxes', 'ChartColumn', 'Inbox'].map((n, i) => ({ ic: ic(n, 16), fg: i === 0 ? '#06171D' : '#9FB8AF', bg: i === 0 ? '#7EF0C4' : 'transparent' }));

    // nightly close
    const ncFlowD = [['Business runs all day', 'Sales, bookings, payments and messages', 'Sun'], ['Noxtill checks everything', 'Profit, credit, stock and issues', 'ScanSearch'], ['Nightly Close is generated', 'A clear summary, with what needs attention', 'FileText'], ['Delivered to WhatsApp', 'Also available in Noxtill', 'MessageCircle']];
    const ncFlow = ncFlowD.map(([t, d, n], i) => { const on = st.nc > i; return { t, d, ic: ic(n, 15), bg: on ? '#07784C' : '#FFFFFF', fg: on ? '#FFFFFF' : '#5F716B', bd: on ? '#07784C' : 'rgba(9,71,55,.18)', line: st.nc > i + 1 ? '#02B07A' : 'rgba(9,71,55,.12)', lineDisp: i < 3 ? 'block' : 'none', op: on ? 1 : 0.55 }; });
    const ncStats = [["Today's sales", '$3,005'], ['Real profit', '$1,120'], ["Tomorrow's bookings", '14'], ['Outstanding credit', '$640'], ['Low stock', '2 items'], ['Customer issues', '1 open']].map(([l, v], i) => ({ l, v, bg: i >= 3 ? '#FBFDFC' : '#FFFFFF', fg: i === 3 ? '#053F2B' : '#06171D' }));
    const ncCards = [
      { n: '01', t: 'Get a full picture', items: ['Sales and real profit', 'Bookings for tomorrow', 'Payments received'] },
      { n: '02', t: 'See what needs attention', items: ['Outstanding credit', 'Low stock', 'Unanswered customers'] },
      { n: '03', t: 'Take action', items: ['Send reminders in one tap', 'Reorder from suppliers', 'Ask Noxtill AI'] },
    ];

    // journey
    const journey = this.JOURNEY.map((s, i) => { const on = i === st.j; return { n: i + 1, t: s.t, ic: ic(s.ic, 16), screen: s.screen, rows: s.rows.map(([k, v]) => ({ k, v })), sel: on ? 'true' : 'false', bd: on ? '#07784C' : 'rgba(9,71,55,.12)', sh: on ? '0 18px 40px -22px rgba(7,120,76,.55)' : 'none', sc: on && !sm ? 1.03 : 1, icBg: on ? '#07784C' : 'rgba(25,190,134,.10)', icFg: on ? '#FFFFFF' : '#07784C', prog: i < st.j ? '100%' : on ? '50%' : '0%', go: () => this.setState({ j: i, jUser: true }) }; });
    const jCur = this.JOURNEY[st.j];

    // tabs
    const indCols = st.w >= 1200 ? 4 : st.w >= 1024 ? 3 : st.w >= 640 ? 2 : 1;
    const indThumb = Math.max(8, Math.min(100, (indCols / this.IND.length) * 100));
    const tabs = this.TABS.map((t, i) => { const on = i === st.tab; return Object.assign({}, t, { src: t.k === 'sell' ? '/marketing/hb/pasted-1791405783304-0-muykr0vb-olgb.png' : undefined, sel: on ? 'true' : 'false', tab: on ? 0 : -1, tid: 'otab-' + t.k, pid: 'opanel-' + t.k, bg: on ? '#06171D' : 'transparent', fg: on ? '#FFFFFF' : '#3D4F4A', disp: on ? 'flex' : 'none', go: () => this.setState({ tab: i }) }); });
    const tc = this.TABS[st.tab];
    const tv = {}; this.TABS.forEach((t, i) => { tv[t.k] = i === st.tab ? (t.k === 'sell' ? 'grid' : 'flex') : 'none'; });
    const tabKey = e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const n = (st.tab + (e.key === 'ArrowRight' ? 1 : 5)) % 6; this.setState({ tab: n }); setTimeout(() => { const b = document.getElementById('otab-' + this.TABS[n].k); b && b.focus(); }, 0); };

    // ai carousel
    const cw = Math.min(440, w - 72), n = this.AI.length;
    const aiCards = this.AI.map((a, i) => { const on = i === st.ai, near = Math.abs(i - st.ai) === 1; return Object.assign({}, a, { slot: 'ai-card-' + a.n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ic: ic(a.ic, 19), pos: (i + 1) + ' of ' + n, ctrl: a.appr ? 'Human approval where required' : 'Recorded in the audit trail', op: on ? 1 : near ? 0.62 : 0.4, sc: on ? 1 : near ? 0.98 : 0.97, bg: on ? '#073A29' : '#05301F', bd: on ? 'rgba(126,240,196,.35)' : 'rgba(255,255,255,.08)', cur: on ? 'default' : 'pointer', tab: on ? 0 : -1, dot: on ? '#7EF0C4' : 'rgba(255,255,255,.25)', dotW: on ? '26px' : '8px', cur2: on ? 'true' : 'false', go: () => { if (!this.aiDragged) this.aiTo(i); } }); });
    const aiStep = d => this.aiTo(Math.max(0, Math.min(n - 1, st.ai + d)));

    // receptionist
    const recSteps = this.REC.map(([t, d], i) => ({ i, n: i + 1, t, d, op: i <= st.rec ? 1 : 0.45, bg: i <= st.rec ? '#07784C' : 'rgba(9,71,55,.06)', fg: i <= st.rec ? '#FFFFFF' : '#5F716B', ref: el => { this.recEls[i] = el; } }));
    const recMsgs = this.REC_MSGS.filter(m => m.s <= st.rec).slice(-6).map(m => ({ t: m.t, al: m.w === 'c' ? 'flex-start' : m.w === 'ai' ? 'flex-end' : 'center', bg: m.w === 'c' ? '#EEF3F1' : m.w === 'ai' ? '#07784C' : 'rgba(25,190,134,.10)', fg: m.w === 'ai' ? '#FFFFFF' : '#053F2B', fw: m.w === 'sys' ? 700 : 500 }));
    const recStatus = st.rec >= 7 ? 'Call complete' : st.rec >= 5 ? 'Booked' : 'Live · 0:' + String(12 + st.rec * 9).padStart(2, '0');

    // modules
    const modGroups = this.MODS.map((g, i) => { const on = i === st.mod; return { n: g.n, ic: ic(g.ic, 16), count: g.m.length, copy: g.copy, screen: g.screen, cols: g.cols, rows: g.rows, alt: 'Noxtill ' + g.screen + ' screen (demo data)', tid: 'mtab-' + i, pid: 'mpanel-' + i, sel: on ? 'true' : 'false', tab: on ? 0 : -1, bd: on ? 'rgba(7,120,76,.45)' : 'transparent', bg: on ? 'rgba(24,190,134,.08)' : 'transparent', icBg: on ? '#07784C' : 'rgba(25,190,134,.08)', icFg: on ? '#FFFFFF' : '#07784C', disp: on ? 'grid' : 'none', mods: g.m.map(([mn, href, mi]) => ({ n: mn, href, ic: ic(mi, 15) })), go: () => this.setState({ mod: i }) }; });
    const modKey = e => { const k = e.key; if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(k)) return; e.preventDefault(); const d = (k === 'ArrowDown' || k === 'ArrowRight') ? 1 : 6; const nx = (st.mod + d) % 7; this.setState({ mod: nx }); setTimeout(() => { const b = document.getElementById('mtab-' + nx); b && b.focus(); }, 0); };

    // pos
    const p = st.pos;
    const posProducts = [['Argan oil shampoo', '$24.00', p >= 2 ? '2 left' : '3 left', true], ['Styling cream', '$18.00', p >= 2 ? '11 left' : '12 left', true], ['Hair mask', '$16.00', p >= 2 ? '7 left' : '8 left', true], ['Gift card', '$50.00', 'Digital', false], ['Comb set', '$9.00', '20 left', false], ['Heat spray', '$14.00', '6 left', false]].map(([nn, pr, s, inCart]) => ({ n: nn, p: pr, s, bd: inCart ? 'rgba(2,176,122,.45)' : 'rgba(9,71,55,.10)', bg: inCart ? 'rgba(25,190,134,.06)' : '#FFFFFF', sc: inCart && p >= 2 ? '#07784C' : '#5F716B' }));
    const cart = [['1', 'Argan oil shampoo', '$24.00'], ['1', 'Styling cream', '$18.00'], ['1', 'Hair mask', '$16.00']].map(([q, nn, t]) => ({ q, n: nn, t }));
    const posFx = ['Payment captured · receipt sent', 'Inventory updated', "Added to Emily's history", "Today's sales report updated"].map((t, i) => ({ t, op: p >= i + 2 ? 1 : 0, tx: p >= i + 2 ? '0px' : '-6px' }));

    // hub
    const intItems = this.INT.map((g, i) => { const on = i === st.hub; return { n: g.n, logo: g.logo, short: g.short, sel: on ? 'true' : 'false', bd: on ? '#07784C' : 'rgba(9,71,55,.12)', sh: on ? '0 14px 30px -18px rgba(7,120,76,.6)' : 'none', line: on ? '#02B07A' : 'rgba(9,71,55,.12)', go: () => this.setState({ hub: i }) }; });

    const mobileCols = w < 960;
    return {
      I, wide,
      evPos: wide ? 'absolute' : 'relative', evW: wide ? '310px' : '100%', evMt: wide ? '0' : '16px',
      kpis, bars, feed, events, sideIcons,
      tools: [["Shopify","shopify"],["WooCommerce","woocommerce"],["Square","square"],["PayPal","paypal"],["QuickBooks","quickbooks"],["Zoho","zoho"],["Stripe","stripe"],["HubSpot","hubspot"],["Mailchimp","mailchimp"],["WordPress","wordpress"],["Meta Business Suite","meta"],["WhatsApp","whatsapp"],["Email","gmail"],["SMS","",["SMS","#1E88E5","#FFFFFF","9px"]],["Facebook Messenger","messenger"],["Instagram","instagram"],["LinkedIn","",["in","#0A66C2","#FFFFFF","15px"]],["TikTok","tiktok"],["Google Business Profile","",["G","#4285F4","#FFFFFF","15px"]],["Apple Business Connect","apple"],["Bing Places","",["b","#008373","#FFFFFF","16px"]],["Yelp","yelp"],["Trustpilot","trustpilot"],["Clutch","",["C","#17313B","#FFFFFF","16px"]],["G2","g2"],["Capterra","",["➤","#FFFFFF","#FF9D28","18px"]],["BBB","",["BBB","#005A78","#FFFFFF","9px"]],["Yellow Pages","",["YP","#FFD400","#111111","11px"]],["Google","google"],["Twilio","",["●","#F22F46","#FFFFFF","14px"]],["Zapier","zapier"],["AWS","",["aws","#FFFFFF","#232F3E","12px"]],["Claude","claude"],["ChatGPT","",["AI","#10A37F","#FFFFFF","11px"]],["Canva","",["C","#00C4CC","#FFFFFF","15px"]],["GoodFirms","",["★","#B8902F","#FFFFFF","15px"]]].map(([n, slug, fb]) => ({ n, alt: n + ' logo', hasLogo: !!slug, noLogo: !slug, logo: slug ? 'https://cdn.simpleicons.org/' + slug : '', mark: fb ? fb[0] : '', bg: fb ? fb[1] : '', fg: fb ? fb[2] : '', fs: fb ? fb[3] : '' })),
      H2: { plug: ic('Plug', 16), shield: ic('ShieldCheck', 16), zap: ic('Zap', 16), chart: ic('ChartColumn', 16), users: ic('UsersRound', 16) },
      heroGap: wide ? '36px' : '40px', heroCols: wide ? 'minmax(0,0.82fr) minmax(0,1fr)' : 'minmax(0,1fr)', heroLapMr: wide ? '110px' : '0', heroPad: wide ? '56px 0 40px' : '0',
      H: { zap: ic('Zap', 16), star: ic('Star', 19), play: ic('CirclePlay', 22), sparkle: ic('Sparkles', 13), chk: ic('Check', 14), sprout: ic('Sprout', 16), bell: ic('Bell', 13), cal: ic('CalendarCheck', 19), wa: ic('MessageCircle', 19), alert: ic('TriangleAlert', 19), ai: ic('Sparkles', 19) },
      heroNav: [['Dashboard','LayoutDashboard'],['Sales','ShoppingCart'],['Orders','ClipboardList'],['Bookings','Calendar'],['Customers','Users'],['Products','Package'],['Inventory','Boxes'],['Marketing','Megaphone'],['AI Assistant','Bot'],['Reports','ChartColumn'],['Settings','Settings']].map(([t, n], i) => ({ t, ic: ic(n, 12), fw: i === 0 ? 700 : 500, fg: i === 0 ? '#07784C' : '#3D4F4A', bg: i === 0 ? 'rgba(25,190,134,.12)' : 'transparent' })),
      heroKpis: [['Total Sales','$18,760','12%'],['Total Profit','$4,890','10%'],['Bookings','128','15%'],['Customers','1,245','12%']].map(([l, v, d]) => ({ l, v, d })),
      heroProducts: [['Hair Shampoo','246','#E9C46A'],['Hair Color','198','#8E5A3C'],['Skin Cleanser','156','#9AD1C0'],['Body Lotion','132','#E8B4A0'],['Face Serum','98','#C9A227']].map(([n, v, c]) => ({ n, v, c })),
      phoneRows: [['New Booking','Sarah · Facial','CalendarCheck','rgba(25,190,134,.14)','#07784C'],['Payment Received','$125.00 via card','MessageCircle','rgba(25,190,134,.14)','#07784C'],['Low Stock Alert','Hair Serum (3 left)','TriangleAlert','#FDEBDD','#E2711D'],['AI Insight','Sales up 20%','Sparkles','#E6EEFD','#3366CC']].map(([t, d, n, bg, fg]) => ({ t, d, ic: ic(n, 13), bg, fg })),
      integrations: this.INT,
      ncRef: el => { this.ncEl = el; }, ncCols: wide ? 'minmax(0,1fr) 300px minmax(0,0.85fr)' : 'minmax(0,1fr)', ncFlow, ncStats, ncCards,
      ncTyping: st.nc === 2, ncSent: st.nc >= 2, ncInput: st.nc === 1 ? "Give me today's report" : '', ncDots: createElement('span', { style: { display: 'flex', gap: 4 } }, [0, 1, 2].map(k => createElement('span', { key: k, style: { width: 6, height: 6, borderRadius: 9, background: '#9AA5A1', animation: 'nxPulse 1s ' + (k * .15) + 's ease-in-out infinite' } }))),
      ncCardOp: st.nc >= 3 ? 1 : 0, ncCardTy: st.nc >= 3 ? '0' : '14px', ncObsOp: st.nc >= 10 ? 1 : 0, ncObsTy: st.nc >= 10 ? '0' : '8px',
      ncRows: [["Today's sales", '$3,005', 'ChartColumn', '#19BE86', '#06171D'], ['Real profit', '$1,120', 'Landmark', '#3D4643', '#06171D'], ["Tomorrow's bookings", '14', 'Calendar', '#3D4643', '#06171D'], ['Outstanding credit', '$640', 'CreditCard', '#3D4643', '#06171D'], ['Low stock', '2 items', 'Package', '#F29A1F', '#F29A1F'], ['Customer issues', '1 open', 'CircleAlert', '#E5484D', '#E5484D']].map(([l, v, n, c, vc], i) => { const on = st.nc >= 4 + i; return { l, v, ic: ic(n, 15), ic_c: c, vc, op: on ? 1 : 0, tx: on ? '0' : '-10px' }; }),
      jRef: el => { this.jEl = el; }, journey, jCur, jDir: sm ? 'column' : 'row', jOverflow: sm ? 'visible' : 'auto',
      tabs, tabCur: { screen: tc.screen, alt: tc.alt, ic: ic(tc.ic, 15) }, tv, tabKey,
      pipeline: [{ n: 'New lead', c: '4', cards: [{ n: 'Star Cafe', s: 'Catering enquiry · Web form', v: '$600 est.' }, { n: 'Omar T.', s: 'WhatsApp · Bridal package', v: '$320 est.' }] }, { n: 'Quoted', c: '3', cards: [{ n: 'Kashif Traders', s: 'Quote Q-88 sent Mon', v: '$1,150' }, { n: 'Hina S.', s: 'Follow-up due today', v: '$210' }] }, { n: 'Won', c: '6', cards: [{ n: 'Bilal R.', s: 'Invoice #1040 paid', v: '$410' }, { n: 'Emily Carter', s: 'Invoice #1042 paid', v: '$145' }] }],
      growTiles: [{ l: 'Autumn rebook', v: 'Scheduled', s: 'WhatsApp · Lapsed 60 days' }, { l: 'Google listing', v: 'Up to date', s: 'Hours synced today' }, { l: 'Reviews this month', v: '23', s: 'Average 4.7 · demo' }],
      reviewRows: [{ n: 'Emily Carter', v: 'Visit today', s: 'Queued · 6 PM', c: '#5F716B' }, { n: 'Bilal R.', v: 'Visit Mon', s: 'Reviewed ★★★★★', c: '#07784C' }, { n: 'Hina S.', v: 'Visit Sun', s: 'Opened', c: '#5F716B' }, { n: 'Omar T.', v: 'Visit Sat', s: 'Reviewed ★★★★', c: '#07784C' }],
      bookingRows: [{ t: '10:00', n: 'Hina S.', s: 'Colour · Sara', st: 'Confirmed', c: '#02B07A', bg: 'rgba(25,190,134,.14)' }, { t: '11:30', n: 'Bilal R.', s: 'Beard trim · Ali', st: 'Reminder sent', c: '#9FD3BC', bg: 'rgba(9,71,55,.06)' }, { t: '1:00', n: 'Omar T.', s: 'Haircut · Ali', st: 'Rescheduled', c: '#048E69', bg: 'rgba(4,142,105,.12)' }, { t: '3:00', n: 'Zara M.', s: 'Facial · Mina', st: 'Deposit paid', c: '#02B07A', bg: 'rgba(25,190,134,.14)' }, { t: '4:30', n: 'Emily Carter', s: 'Haircut & style · Sara', st: 'Confirmed', c: '#02B07A', bg: 'rgba(25,190,134,.14)' }],
      marginRows: [['Colour treatment', '$4,200', '$1,260', 70], ['Haircut & style', '$3,100', '$1,400', 55], ['Argan oil shampoo', '$960', '$610', 36], ['Facial', '$1,800', '$1,150', 36], ['Gift cards', '$600', '$540', 10]].map(([nn, r, c, m]) => ({ n: nn, r, c, m: m + '%', w: m + '%', col: m >= 50 ? '#02B07A' : m >= 30 ? '#048E69' : '#9FB8AF' })),
      flowNodes: [['TRIGGER', 'Invoice unpaid for 7 days', 'Clock'], ['CONDITION', 'Customer has no open dispute', 'Filter'], ['ACTION', 'Send WhatsApp reminder + create task', 'Send'], ['APPROVAL', 'Owner approves any late fee', 'UserCheck']].map(([k, t, n2], i) => ({ k, t, ic: ic(n2, 15), lineDisp: i < 3 ? 'block' : 'none', bd: i === 3 ? 'rgba(2,176,122,.5)' : 'rgba(9,71,55,.12)', bg: i === 3 ? 'rgba(25,190,134,.06)' : '#FFFFFF', icBg: i === 0 ? '#06171D' : 'rgba(25,190,134,.10)', icFg: i === 0 ? '#7EF0C4' : '#07784C' })),
      branchRows: [{ n: 'Main branch', s: '$3,005', b: '19', st: '5 of 6', c: '#02B07A' }, { n: 'Gulberg', s: '$2,410', b: '15', st: '4 of 4', c: '#02B07A' }, { n: 'DHA', s: '$1,980', b: '12', st: '3 of 4', c: '#048E69' }, { n: 'Mall kiosk', s: '$640', b: '—', st: '2 of 2', c: '#9FB8AF' }],
      aiCards, aiCw: cw + 'px', aiTx: 'translateX(' + (-(st.ai * (cw + 24) + cw / 2)) + 'px)',
      aiPrev: () => aiStep(-1), aiNext: () => aiStep(1),
      aiKey: e => { if (e.key === 'ArrowRight') { e.preventDefault(); aiStep(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); aiStep(-1); } },
      aiPause: () => this.setState({ aiHold: true }), aiResume: () => this.setState({ aiHold: false }),
      aiTs: e => { this.tx0 = e.touches[0].clientX; }, aiTe: e => { const dx = e.changedTouches[0].clientX - (this.tx0 || 0); if (Math.abs(dx) > 40) aiStep(dx < 0 ? 1 : -1); },
      stackPos: stk ? 'sticky' : 'relative', stackCols: stk ? 'minmax(340px,0.78fr) minmax(0,1.32fr)' : 'minmax(0,1fr)',
      stackRef: el => { this.stackEl = el; },
      scUI: scMode !== 'Screenshot slots', scShots: scMode === 'Screenshot slots',
      scPos: stk ? 'absolute' : 'static', scSide: w >= 560 ? 'flex' : 'none', sc2: w >= 700 ? 'minmax(0,1fr) minmax(0,1.15fr)' : 'minmax(0,1fr)', scFH: stk ? '440px' : 'auto',
      scBleed: stk ? 'calc(-1 * clamp(24px, 3vw, 40px))' : '0px', scWideW: stk ? '122%' : '100%', scBR: stk ? '16px 0 0 16px' : '16px',
      scD: stk ? 'minmax(0,1.55fr) minmax(0,1fr)' : 'minmax(0,1fr)', scOv: stk ? '-36px' : '0px',
      aiRef: el => { this.aiEl = el; }, aiScroll: () => this.aiSync(), aiPd: e => this.aiDrag(e), aiHalf: (cw / 2) + 'px',
      recRinging: st.rec === 0, recTalking: st.rec > 0, recBar: st.rec === 0 ? '#FFFFFF' : '#06171D',
      recPulse: createElement('span', { style: { marginTop: 34, width: 96, height: 96, borderRadius: 999, background: 'rgba(25,190,134,.18)', boxShadow: '0 0 0 14px rgba(25,190,134,.10), 0 0 0 28px rgba(25,190,134,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: '#7EF0C4', animation: 'nxPulse 1.4s ease-in-out infinite' } }, 'EC'),
      recCols: mobileCols ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', recPos: mobileCols ? 'relative' : 'sticky', recSteps, recMsgs, recStatus, recCaller: st.rec >= 1 ? 'Emily Carter · Returning' : 'Incoming call · +1 555 0134',
      modGroups, modKey, modCols: wide ? '300px minmax(0,1fr)' : 'minmax(0,1fr)', modDir: wide ? 'column' : 'row', modOverflow: wide ? 'visible' : 'auto', modOrient: wide ? 'vertical' : 'horizontal',
      inboxCols: wide ? '230px minmax(0,1fr) 270px' : (sm ? 'minmax(0,1fr)' : 'minmax(0,1fr) 250px'), inboxLeft: wide ? 'flex' : 'none', inboxRight: sm ? 'none' : 'flex',
      threads: [['Emily Carter', 'EC', 'WhatsApp', 'Is my order ready? Also can I…', true], ['Star Cafe', 'SC', 'Email', 'Catering quote for 40 people', false], ['Omar T.', 'OT', 'Instagram', 'Do you do bridal packages?', false], ['Web visitor', 'WV', 'Web chat', 'What time do you close today?', false], ['Hina S.', 'HS', 'WhatsApp', 'Thank you! See you Friday', false]].map(([nn, inn, ch, m, on]) => ({ n: nn, in: inn, ch, m, bg: on ? 'rgba(24,190,134,.07)' : 'transparent', bl: on ? '#07784C' : 'transparent' })),
      custStats: [{ l: 'Lifetime spend', v: '$1,240' }, { l: 'Balance', v: '$45 due' }, { l: 'Bookings', v: '6' }, { l: 'Orders', v: '4' }],
      custActivity: ['Paid invoice #1042 · $145', 'Booked Fri 4:30 PM by phone', 'Left a 5-star review'],
      posProducts, cart, posFx, posGo: () => this.posRun(), posBtn: p >= 5 ? 'New sale' : p >= 1 ? 'Processing…' : 'Complete sale · $62.64', posBtnBg: p >= 5 ? '#06171D' : '#07784C', posBtnIc: p >= 5 ? ic('RotateCcw', 15) : ic('CreditCard', 15),
      hubCols: mobileCols ? 'minmax(0,1fr)' : 'minmax(0,1fr) 300px minmax(0,1fr)', hubLine: mobileCols ? '0px' : '40px', hubOrderA: mobileCols ? 2 : 1, hubOrderC: mobileCols ? 1 : 2,
      hubLeft: intItems.slice(0, 4), hubRight: intItems.slice(4), hubCur: this.INT[st.hub],
      indRef: el => { this.indEl = el; }, indPrev: () => this.indStep(-1), indNext: () => this.indStep(1),
      indScroll: () => this.indSync(), indKey: e => { if (e.key === 'ArrowRight') { e.preventDefault(); this.indStep(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); this.indStep(-1); } },
      indBasis: indCols === 1 ? '86%' : 'calc((100% - ' + ((indCols - 1) * 16) + 'px) / ' + indCols + ')',
      indAtStart: (st.indProg || 0) <= 0.001, indAtEnd: (st.indProg || 0) >= 0.999,
      indPrevOp: (st.indProg || 0) <= 0.001 ? 0.4 : 1, indNextOp: (st.indProg || 0) >= 0.999 ? 0.4 : 1,
      indThumbW: indThumb + '%', indThumbL: ((st.indProg || 0) * (100 - indThumb)) + '%',
      indM: this.indModal(ic), indClose: () => this.closeInd(), indStop: e => e.stopPropagation(), indDlgRef: el => { this.dlgEl = el; }, indTrap: e => this.trapInd(e),
      industries: this.IND.map(([nn, slug, i2, line, flow], ix) => { const im = this.IMG[slug] || Object.values(this.IMG)[ix % 8]; const act = ix === (st.indActive || 0); return { open: e => { e.preventDefault(); this.openInd(ix, e.currentTarget); }, short: this.SHORT[slug] || (nn.length > 20 ? nn.split(' & ')[0] : nn), bd: act ? 'rgba(2,176,122,.45)' : 'rgba(9,71,55,.10)', sh: act ? '0 18px 40px -26px rgba(16,45,38,.38)' : '0 10px 28px -24px rgba(16,45,38,.28)', accent: act ? '#02B07A' : 'transparent', n: nn, href: '/industries/' + slug, ic: ic(i2, 20), line, img: 'https://images.unsplash.com/' + im[0] + '?auto=format&fit=crop&w=800&q=72', alt: im[1], credit: 'Photo: ' + im[2] + ' / Unsplash', hasImg: !(this.state.imgFail || {})[slug], noImg: !!(this.state.imgFail || {})[slug], onErr: () => this.setState(s => ({ imgFail: Object.assign({}, s.imgFail, { [slug]: true }) })), slot: 'ind-img-' + slug, flow: flow.map((t, k) => ({ t, line: k < flow.length - 1 ? 'rgba(2,176,122,.35)' : 'transparent' })) }; }),
      solPos: mobileCols ? 'relative' : 'sticky',
      solutions: this.SOL.map(([pp, nn, slug, i2]) => ({ p: pp, n: nn, href: '/solutions/' + slug, ic: ic(i2, 18) })),
      bhCats: [['Sales health', 78], ['Customer health', 71], ['Cash & credit', 58], ['Operations', 82], ['Reputation', 66], ['Growth', 61]].map(([nn, v]) => ({ n: nn, v, l: v >= 75 ? 'Strong' : v >= 65 ? 'Fair' : 'Needs work', w: v + '%', c: v >= 75 ? '#02B07A' : v >= 65 ? '#048E69' : '#07784C' })),
      bhActions: ['Follow up 6 overdue credit balances', "Ask last week's 14 customers for a review", 'Reorder 2 low-stock products'],
      trust: this.TRUST.map(([nn, d, i2]) => ({ n: nn, d, ic: ic(i2, 22) })),
      plans: this.PLANS.map(([nn, d]) => ({ n: nn, d, pop: nn === 'Growth', bd: nn === 'Growth' ? '2px solid #07784C' : '1px solid rgba(9,71,55,.12)', sh: nn === 'Growth' ? '0 20px 40px -24px rgba(7,120,76,.5)' : 'none' })),
      resources: this.RES.map(([nn, href, i2, d]) => ({ n: nn, href, d, ic: ic(i2, 20) })),
      faqSpan: 1, footSpan: sm ? 1 : 2,
      footCols: [
        { h: 'PLATFORM', links: [['Platform overview', '/platform'], ['Fast Sale (POS)', '/platform/fast-sale'], ['Customers (CRM)', '/platform/crm'], ['Bookings', '/platform/bookings'], ['All 40 modules', '/platform/modules']] },
        { h: 'AI', links: [['AI overview', '/ai'], ['AI Assistant', '/ai/assistant'], ['AI Phone Receptionist', '/ai/phone-receptionist'], ['Business Intelligence', '/ai/business-intelligence']] },
        { h: 'COMPANY', links: [['Solutions', '/solutions'], ['Industries', '/industries'], ['Pricing', '/pricing'], ['Nightly Close', '/nightly-close'], ['Contact Sales', '/contact-sales']] },
        { h: 'RESOURCES', links: [['Resources', '/resources'], ['Blog', '/blog'], ['Help Centre', '/help'], ['API Reference', '/developers/api'], ['System Status', '/status']] },
      ].map(c => ({ h: c.h, links: c.links.map(([n, href]) => ({ n, href })) })),
      legal: [['Privacy Policy', '/legal/privacy'], ['Terms of Service', '/legal/terms'], ['Security', '/security'], ['Trust Center', '/trust'], ['AI Transparency', '/ai-transparency']].map(([n, href]) => ({ n, href })),
      faq: this.FAQ.map(([q, a], i) => { const on = st.faq === i; return { q, a, bid: 'faq-b-' + i, pid: 'faq-p-' + i, exp: on ? 'true' : 'false', disp: on ? 'block' : 'none', rot: on ? '45deg' : '0deg', go: () => this.setState({ faq: on ? -1 : i }) }; }),
    };
  }
}
