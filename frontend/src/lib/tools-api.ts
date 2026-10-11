import { apiFetch } from "@/lib/api-client";

// ==========================================
// FT-01: Discount Calculator
// ==========================================
export interface DiscountInput {
  originalUnitPrice: number;
  quantity?: number;
  currency?: string;
  discountMode: "percent" | "fixed" | "stacked";
  discountPercent?: number;
  discountAmount?: number;
  stackedDiscounts?: number[];
  taxMode?: "none" | "exclusive" | "inclusive";
  taxPercent?: number;
}

export interface DiscountStep {
  step: number;
  rate?: number;
  amount: number;
  remaining: number;
}

export interface DiscountResult {
  gross: number;
  quantity: number;
  unitPrice: number;
  totalDiscount: number;
  net: number;
  tax: number;
  finalTotal: number;
  savingsPct: number;
  currency: string;
  discountMode: string;
  taxMode: string;
  steps: DiscountStep[];
}

export function calculateDiscountLocal(input: DiscountInput): DiscountResult {
  const qty = Math.max(1, input.quantity || 1);
  const gross = Math.round((input.originalUnitPrice * qty + Number.EPSILON) * 100) / 100;

  let totalDiscount = 0;
  const steps: DiscountStep[] = [];

  if (input.discountMode === "percent") {
    const pct = Math.min(100, Math.max(0, input.discountPercent || 0));
    totalDiscount = Math.round((gross * (pct / 100) + Number.EPSILON) * 100) / 100;
    steps.push({ step: 1, rate: pct, amount: totalDiscount, remaining: Math.round((gross - totalDiscount) * 100) / 100 });
  } else if (input.discountMode === "fixed") {
    const fixed = Math.max(0, input.discountAmount || 0);
    totalDiscount = Math.min(gross, Math.round(fixed * 100) / 100);
    steps.push({ step: 1, amount: totalDiscount, remaining: Math.round((gross - totalDiscount) * 100) / 100 });
  } else if (input.discountMode === "stacked") {
    const stacked = input.stackedDiscounts && input.stackedDiscounts.length > 0 ? input.stackedDiscounts : [10, 5];
    let current = gross;
    stacked.forEach((pct, idx) => {
      const rate = Math.min(100, Math.max(0, pct));
      const amount = Math.round((current * (rate / 100) + Number.EPSILON) * 100) / 100;
      current = Math.round((current - amount + Number.EPSILON) * 100) / 100;
      totalDiscount = Math.round((totalDiscount + amount + Number.EPSILON) * 100) / 100;
      steps.push({ step: idx + 1, rate, amount, remaining: current });
    });
  }

  const net = Math.round((gross - totalDiscount + Number.EPSILON) * 100) / 100;
  let tax = 0;
  let finalTotal = net;
  const taxRate = Math.min(100, Math.max(0, input.taxPercent || 0));

  if (input.taxMode === "exclusive" && taxRate > 0) {
    tax = Math.round((net * (taxRate / 100) + Number.EPSILON) * 100) / 100;
    finalTotal = Math.round((net + tax + Number.EPSILON) * 100) / 100;
  } else if (input.taxMode === "inclusive" && taxRate > 0) {
    tax = Math.round((net - net / (1 + taxRate / 100) + Number.EPSILON) * 100) / 100;
    finalTotal = net;
  }

  const savingsPct = gross > 0 ? Math.round(((totalDiscount / gross) * 100 + Number.EPSILON) * 100) / 100 : 0;

  return {
    gross,
    quantity: qty,
    unitPrice: input.originalUnitPrice,
    totalDiscount,
    net,
    tax,
    finalTotal,
    savingsPct,
    currency: input.currency || "USD",
    discountMode: input.discountMode,
    taxMode: input.taxMode || "none",
    steps,
  };
}

export async function calculateDiscountApi(input: DiscountInput): Promise<DiscountResult> {
  try {
    return await apiFetch<DiscountResult>(
      "/public/tools/discount/calculate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { skipAuth: true }
    );
  } catch {
    return calculateDiscountLocal(input);
  }
}

// ==========================================
// FT-02: Profit Margin Calculator
// ==========================================
export interface MarginInput {
  salePrice: number;
  costOfGoods: number;
  laborCost?: number;
  overheadCost?: number;
  paymentFeePercent?: number;
  targetGrossMargin?: number;
  currency?: string;
}

export interface MarginResult {
  salePrice: number;
  costOfGoods: number;
  laborCost: number;
  overheadCost: number;
  directCost: number;
  processingFee: number;
  totalCost: number;
  profitDollar: number;
  grossMarginPct: number;
  markupPct: number;
  targetPrice: number | null;
  breakEvenPrice: number;
  currency: string;
}

export function calculateMarginLocal(input: MarginInput): MarginResult {
  const sale = Math.max(0, input.salePrice);
  const directCost = Math.round(((input.costOfGoods || 0) + (input.laborCost || 0) + (input.overheadCost || 0) + Number.EPSILON) * 100) / 100;
  const feePct = Math.min(100, Math.max(0, input.paymentFeePercent || 0));
  const processingFee = Math.round((sale * (feePct / 100) + Number.EPSILON) * 100) / 100;

  const totalCost = Math.round((directCost + processingFee + Number.EPSILON) * 100) / 100;
  const profitDollar = Math.round((sale - totalCost + Number.EPSILON) * 100) / 100;
  const grossMarginPct = sale > 0 ? Math.round(((profitDollar / sale) * 100 + Number.EPSILON) * 100) / 100 : 0;
  const markupPct = directCost > 0 ? Math.round(((profitDollar / directCost) * 100 + Number.EPSILON) * 100) / 100 : 0;

  let targetPrice: number | null = null;
  if (input.targetGrossMargin != null && input.targetGrossMargin > 0) {
    const targetMarginRate = input.targetGrossMargin / 100;
    const combinedDeductionRate = targetMarginRate + feePct / 100;
    if (combinedDeductionRate < 1) {
      targetPrice = Math.round((directCost / (1 - combinedDeductionRate) + Number.EPSILON) * 100) / 100;
    }
  }

  const breakEvenPrice = feePct < 100 ? Math.round((directCost / (1 - feePct / 100) + Number.EPSILON) * 100) / 100 : directCost;

  return {
    salePrice: sale,
    costOfGoods: input.costOfGoods || 0,
    laborCost: input.laborCost || 0,
    overheadCost: input.overheadCost || 0,
    directCost,
    processingFee,
    totalCost,
    profitDollar,
    grossMarginPct,
    markupPct,
    targetPrice,
    breakEvenPrice,
    currency: input.currency || "USD",
  };
}

export async function calculateMarginApi(input: MarginInput): Promise<MarginResult> {
  try {
    return await apiFetch<MarginResult>(
      "/public/tools/margin/calculate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { skipAuth: true }
    );
  } catch {
    return calculateMarginLocal(input);
  }
}

// ==========================================
// FT-03: Break-Even Calculator
// ==========================================
export interface BreakEvenInput {
  fixedCosts: number;
  sellingPricePerUnit: number;
  variableCostPerUnit: number;
  targetProfit?: number;
  period?: "month" | "year" | "quarter";
  currency?: string;
}

export interface BreakEvenChartPoint {
  units: number;
  revenue: number;
  totalCost: number;
  profit: number;
}

export interface BreakEvenResult {
  possible: boolean;
  reason?: string;
  message?: string;
  contributionMargin: number;
  contributionMarginRatio: number;
  fixedCosts: number;
  sellingPricePerUnit: number;
  variableCostPerUnit: number;
  breakEvenUnits: number | null;
  breakEvenRevenue: number | null;
  targetProfitUnits: number | null;
  targetProfitRevenue: number | null;
  chartSeries: BreakEvenChartPoint[];
  currency: string;
  period: string;
}

export function calculateBreakEvenLocal(input: BreakEvenInput): BreakEvenResult {
  const fixed = Math.max(0, input.fixedCosts);
  const price = Math.max(0.01, input.sellingPricePerUnit);
  const varCost = Math.max(0, input.variableCostPerUnit);
  const targetProfit = Math.max(0, input.targetProfit || 0);

  const contributionMargin = Math.round((price - varCost + Number.EPSILON) * 100) / 100;
  const possible = contributionMargin > 0;
  const contributionMarginRatio = possible ? Math.round((contributionMargin / price + Number.EPSILON) * 10000) / 10000 : 0;

  if (!possible) {
    return {
      possible: false,
      reason: "VARIABLE_COST_EXCEEDS_OR_EQUALS_PRICE",
      message: "Unit selling price must be greater than variable cost per unit to achieve break-even.",
      contributionMargin,
      contributionMarginRatio: 0,
      fixedCosts: fixed,
      sellingPricePerUnit: price,
      variableCostPerUnit: varCost,
      breakEvenUnits: null,
      breakEvenRevenue: null,
      targetProfitUnits: null,
      targetProfitRevenue: null,
      chartSeries: [],
      currency: input.currency || "USD",
      period: input.period || "month",
    };
  }

  const exactBreakEvenUnits = fixed / contributionMargin;
  const breakEvenUnits = Math.ceil(exactBreakEvenUnits);
  const breakEvenRevenue = Math.round((breakEvenUnits * price + Number.EPSILON) * 100) / 100;

  const targetExactUnits = (fixed + targetProfit) / contributionMargin;
  const targetProfitUnits = Math.ceil(targetExactUnits);
  const targetProfitRevenue = Math.round((targetProfitUnits * price + Number.EPSILON) * 100) / 100;

  const maxUnits = Math.max(breakEvenUnits * 2, 20);
  const step = Math.max(1, Math.round(maxUnits / 7));
  const chartSeries: BreakEvenChartPoint[] = [];
  for (let u = 0; u <= maxUnits; u += step) {
    const rev = Math.round((u * price + Number.EPSILON) * 100) / 100;
    const cost = Math.round((fixed + u * varCost + Number.EPSILON) * 100) / 100;
    chartSeries.push({ units: u, revenue: rev, totalCost: cost, profit: Math.round((rev - cost) * 100) / 100 });
  }

  return {
    possible: true,
    contributionMargin,
    contributionMarginRatio,
    fixedCosts: fixed,
    sellingPricePerUnit: price,
    variableCostPerUnit: varCost,
    breakEvenUnits,
    breakEvenRevenue,
    targetProfitUnits,
    targetProfitRevenue,
    chartSeries,
    currency: input.currency || "USD",
    period: input.period || "month",
  };
}

export async function calculateBreakEvenApi(input: BreakEvenInput): Promise<BreakEvenResult> {
  try {
    return await apiFetch<BreakEvenResult>(
      "/public/tools/break-even/calculate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { skipAuth: true }
    );
  } catch {
    return calculateBreakEvenLocal(input);
  }
}

// ==========================================
// FT-04: Invoice Generator
// ==========================================
export interface InvoiceLineItem {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  lineGross?: number;
  discountAmount?: number;
  lineNet?: number;
  taxAmount?: number;
  lineTotal?: number;
}

export interface InvoiceParty {
  name: string;
  email?: string;
  address?: string;
  phone?: string;
  taxId?: string;
}

export interface InvoiceInput {
  currency?: string;
  lines: InvoiceLineItem[];
  seller?: InvoiceParty;
  buyer?: InvoiceParty;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
}

export interface InvoiceResult {
  lines: InvoiceLineItem[];
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  totalAmount: number;
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  notes: string;
}

export function calculateInvoiceLocal(input: InvoiceInput): InvoiceResult {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const computedLines = (input.lines || []).map((line, idx) => {
    const qty = Math.max(0.001, line.quantity);
    const price = Math.max(0, line.unitPrice);
    const lineGross = Math.round((qty * price + Number.EPSILON) * 100) / 100;
    const discPct = Math.min(100, Math.max(0, line.discountPercent || 0));
    const lineDisc = Math.round((lineGross * (discPct / 100) + Number.EPSILON) * 100) / 100;
    const lineNet = Math.round((lineGross - lineDisc + Number.EPSILON) * 100) / 100;
    const taxPct = Math.min(100, Math.max(0, line.taxPercent || 0));
    const lineTax = Math.round((lineNet * (taxPct / 100) + Number.EPSILON) * 100) / 100;
    const lineTotal = Math.round((lineNet + lineTax + Number.EPSILON) * 100) / 100;

    subtotal = Math.round((subtotal + lineNet + Number.EPSILON) * 100) / 100;
    totalDiscount = Math.round((totalDiscount + lineDisc + Number.EPSILON) * 100) / 100;
    totalTax = Math.round((totalTax + lineTax + Number.EPSILON) * 100) / 100;

    return {
      id: idx + 1,
      description: line.description,
      quantity: qty,
      unitPrice: price,
      lineGross,
      discountPercent: discPct,
      discountAmount: lineDisc,
      lineNet,
      taxPercent: taxPct,
      taxAmount: lineTax,
      lineTotal,
    };
  });

  const totalAmount = Math.round((subtotal + totalTax + Number.EPSILON) * 100) / 100;

  return {
    lines: computedLines,
    subtotal,
    totalDiscount,
    totalTax,
    totalAmount,
    currency: input.currency || "USD",
    seller: input.seller || { name: "Your Business Name" },
    buyer: input.buyer || { name: "Client / Customer" },
    invoiceNumber: input.invoiceNumber || "INV-0001",
    issueDate: input.issueDate || new Date().toISOString().slice(0, 10),
    dueDate: input.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    notes: input.notes || "Thank you for your business!",
  };
}

export async function calculateInvoiceApi(input: InvoiceInput): Promise<InvoiceResult> {
  try {
    return await apiFetch<InvoiceResult>(
      "/public/tools/invoice/calculate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { skipAuth: true }
    );
  } catch {
    return calculateInvoiceLocal(input);
  }
}

// ==========================================
// FT-05: QR Code Generator
// ==========================================
export interface QrInput {
  qrType: "url" | "text" | "wifi" | "sms" | "phone" | "email" | "vcard";
  payload?: string;
  errorCorrection?: "L" | "M" | "Q" | "H";
  foregroundColor?: string;
  backgroundColor?: string;
  size?: number;
  wifi?: {
    ssid: string;
    password?: string;
    encryption?: "WPA" | "WEP" | "nopass";
    hidden?: boolean;
  };
  vcard?: {
    firstName: string;
    lastName?: string;
    org?: string;
    title?: string;
    phone?: string;
    email?: string;
    url?: string;
  };
  phone?: string;
  smsMessage?: string;
  emailAddress?: string;
  emailSubject?: string;
  emailBody?: string;
}

export interface QrResult {
  payload: string;
  qrType: string;
  errorCorrection: string;
  svg: string;
  dataUrl: string;
}

export async function encodeQrApi(input: QrInput): Promise<QrResult> {
  return await apiFetch<QrResult>(
    "/public/tools/qr/encode",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { skipAuth: true }
  );
}

// ==========================================
// FT-06: Google Review Kit
// ==========================================
export interface ReviewKitInput {
  reviewLink: string;
  businessDisplayName: string;
  tagline?: string;
  language?: string;
}

export interface ReviewKitResult {
  reviewLink: string;
  businessDisplayName: string;
  cardHeadline: string;
  cardBody: string;
  qrSvg: string;
  qrDataUrl: string;
}

export async function composeReviewKitApi(input: ReviewKitInput): Promise<ReviewKitResult> {
  return await apiFetch<ReviewKitResult>(
    "/public/tools/review-kit/compose",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { skipAuth: true }
  );
}

// ==========================================
// FT-07: WhatsApp Link Generator
// ==========================================
export interface WhatsappInput {
  internationalNumber: string;
  prefilledMessage?: string;
}

export interface WhatsappResult {
  internationalNumber: string;
  fullUrl: string;
  prefilledMessage: string;
  qrSvg: string;
  qrDataUrl: string;
}

export async function composeWhatsappApi(input: WhatsappInput): Promise<WhatsappResult> {
  return await apiFetch<WhatsappResult>(
    "/public/tools/whatsapp/compose",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { skipAuth: true }
  );
}

// ==========================================
// FT-08: UTM Campaign Link Builder
// ==========================================
export interface UtmInput {
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm?: string;
  utmContent?: string;
  lowercase?: boolean;
}

export interface UtmResult {
  finalUrl: string;
  destinationUrl: string;
  hasExistingUtmConflict: boolean;
  existingTags: string[];
  qrSvg: string;
  qrDataUrl: string;
}

export async function composeUtmApi(input: UtmInput): Promise<UtmResult> {
  return await apiFetch<UtmResult>(
    "/public/tools/utm/compose",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { skipAuth: true }
  );
}

// ==========================================
// FT-09: Email Signature Generator
// ==========================================
export interface SignatureInput {
  fullName: string;
  jobTitle?: string;
  department?: string;
  companyName: string;
  email: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: string;
  avatarUrl?: string;
  template?: "modern" | "minimal" | "corporate" | "compact";
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
}

export interface SignatureResult {
  template: string;
  html: string;
  plainText: string;
}

export async function renderSignatureApi(input: SignatureInput): Promise<SignatureResult> {
  return await apiFetch<SignatureResult>(
    "/public/tools/signature/render",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { skipAuth: true }
  );
}

// ==========================================
// FT-10: Missed Call Revenue Calculator
// ==========================================
export interface MissedCallInput {
  missedCalls: number;
  eligibleSharePct?: number;
  contactRatePct?: number;
  bookingRatePct?: number;
  saleClosePct?: number;
  averageSaleValue: number;
  grossMarginPct?: number;
  currency?: string;
}

export interface MissedCallScenario {
  eligibleCallers: number;
  reachedCallers: number;
  bookedAppointments: number;
  closedSales: number;
  lostRevenueMonthly: number;
  lostProfitMonthly: number;
  lostRevenueAnnual: number;
  lostProfitAnnual: number;
}

export interface MissedCallResult {
  missedCalls: number;
  averageSaleValue: number;
  grossMarginPct: number;
  currency: string;
  base: MissedCallScenario;
  conservative: MissedCallScenario;
  optimistic: MissedCallScenario;
}

export function calculateMissedCallLocal(input: MissedCallInput): MissedCallResult {
  const missed = Math.max(0, input.missedCalls);
  const avgTicket = Math.max(0, input.averageSaleValue);
  const marginPct = Math.min(100, Math.max(0, input.grossMarginPct || 45));

  const computeModel = (eligRate: number, reachRate: number, bookRate: number, closeRate: number) => {
    const eligible = Math.round((missed * (eligRate / 100) + Number.EPSILON) * 100) / 100;
    const reached = Math.round((eligible * (reachRate / 100) + Number.EPSILON) * 100) / 100;
    const booked = Math.round((reached * (bookRate / 100) + Number.EPSILON) * 100) / 100;
    const closed = Math.round((booked * (closeRate / 100) + Number.EPSILON) * 100) / 100;
    const lostRevenueMonthly = Math.round((closed * avgTicket + Number.EPSILON) * 100) / 100;
    const lostProfitMonthly = Math.round((lostRevenueMonthly * (marginPct / 100) + Number.EPSILON) * 100) / 100;
    const lostRevenueAnnual = Math.round((lostRevenueMonthly * 12 + Number.EPSILON) * 100) / 100;
    const lostProfitAnnual = Math.round((lostProfitMonthly * 12 + Number.EPSILON) * 100) / 100;

    return {
      eligibleCallers: eligible,
      reachedCallers: reached,
      bookedAppointments: booked,
      closedSales: closed,
      lostRevenueMonthly,
      lostProfitMonthly,
      lostRevenueAnnual,
      lostProfitAnnual,
    };
  };

  const base = computeModel(
    input.eligibleSharePct ?? 80,
    input.contactRatePct ?? 50,
    input.bookingRatePct ?? 40,
    input.saleClosePct ?? 60
  );

  const conservative = computeModel(
    Math.max(10, (input.eligibleSharePct ?? 80) * 0.8),
    Math.max(10, (input.contactRatePct ?? 50) * 0.7),
    Math.max(10, (input.bookingRatePct ?? 40) * 0.7),
    Math.max(10, (input.saleClosePct ?? 60) * 0.8)
  );

  const optimistic = computeModel(
    Math.min(95, (input.eligibleSharePct ?? 80) * 1.15),
    Math.min(90, (input.contactRatePct ?? 50) * 1.3),
    Math.min(85, (input.bookingRatePct ?? 40) * 1.3),
    Math.min(90, (input.saleClosePct ?? 60) * 1.2)
  );

  return {
    missedCalls: missed,
    averageSaleValue: avgTicket,
    grossMarginPct: marginPct,
    currency: input.currency || "USD",
    base,
    conservative,
    optimistic,
  };
}

export async function calculateMissedCallApi(input: MissedCallInput): Promise<MissedCallResult> {
  try {
    return await apiFetch<MissedCallResult>(
      "/public/tools/missed-call-revenue/calculate",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      { skipAuth: true }
    );
  } catch {
    return calculateMissedCallLocal(input);
  }
}
