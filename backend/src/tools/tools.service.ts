import { Injectable, BadRequestException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import {
  BreakEvenCalculateDto,
  DiscountCalculateDto,
  InvoiceCalculateDto,
  MarginCalculateDto,
  MissedCallCalculateDto,
  QrEncodeDto,
  ReviewKitComposeDto,
  SignatureRenderDto,
  UtmComposeDto,
  WhatsappComposeDto,
} from './dto/tools.dto';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** A parseable http(s) URL whose host has a dot (`noxtill.com`, not a bare word like `hello`). */
function hasPublicHost(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return /^[^.\s]+(\.[^.\s]+)+$/.test(host);
  } catch {
    return false;
  }
}

@Injectable()
export class ToolsService {
  /** FT-01: Discount Calculator */
  calculateDiscount(dto: DiscountCalculateDto) {
    const qty = Math.max(1, dto.quantity || 1);
    const gross = r2(dto.originalUnitPrice * qty);

    let totalDiscount = 0;
    const steps: {
      step: number;
      rate?: number;
      amount: number;
      remaining: number;
    }[] = [];

    if (dto.discountMode === 'percent') {
      const pct = Math.min(100, Math.max(0, dto.discountPercent || 0));
      totalDiscount = r2(gross * (pct / 100));
      steps.push({
        step: 1,
        rate: pct,
        amount: totalDiscount,
        remaining: r2(gross - totalDiscount),
      });
    } else if (dto.discountMode === 'fixed') {
      const fixed = Math.max(0, dto.discountAmount || 0);
      totalDiscount = Math.min(gross, r2(fixed));
      steps.push({
        step: 1,
        amount: totalDiscount,
        remaining: r2(gross - totalDiscount),
      });
    } else if (dto.discountMode === 'stacked') {
      const stacked =
        dto.stackedDiscounts && dto.stackedDiscounts.length > 0
          ? dto.stackedDiscounts
          : [10, 5];
      let current = gross;
      stacked.forEach((pct, idx) => {
        const rate = Math.min(100, Math.max(0, pct));
        const amount = r2(current * (rate / 100));
        current = r2(current - amount);
        totalDiscount = r2(totalDiscount + amount);
        steps.push({ step: idx + 1, rate, amount, remaining: current });
      });
    }

    const net = r2(gross - totalDiscount);
    let tax = 0;
    let finalTotal = net;
    const taxRate = Math.min(100, Math.max(0, dto.taxPercent || 0));

    if (dto.taxMode === 'exclusive' && taxRate > 0) {
      tax = r2(net * (taxRate / 100));
      finalTotal = r2(net + tax);
    } else if (dto.taxMode === 'inclusive' && taxRate > 0) {
      tax = r2(net - net / (1 + taxRate / 100));
      finalTotal = net;
    }

    const savingsPct = gross > 0 ? r2((totalDiscount / gross) * 100) : 0;

    return {
      gross,
      quantity: qty,
      unitPrice: dto.originalUnitPrice,
      totalDiscount,
      net,
      tax,
      finalTotal,
      savingsPct,
      currency: dto.currency || 'USD',
      discountMode: dto.discountMode,
      taxMode: dto.taxMode || 'none',
      steps,
    };
  }

  /** FT-02: Profit Margin Calculator */
  calculateMargin(dto: MarginCalculateDto) {
    const sale = Math.max(0, dto.salePrice);
    const directCost = r2(
      dto.costOfGoods + (dto.laborCost || 0) + (dto.overheadCost || 0),
    );
    const feePct = Math.min(100, Math.max(0, dto.paymentFeePercent || 0));
    const processingFee = r2(sale * (feePct / 100));

    const totalCost = r2(directCost + processingFee);
    const profitDollar = r2(sale - totalCost);
    const grossMarginPct = sale > 0 ? r2((profitDollar / sale) * 100) : 0;
    const markupPct =
      directCost > 0 ? r2((profitDollar / directCost) * 100) : 0;

    let targetPrice: number | null = null;
    if (dto.targetGrossMargin != null && dto.targetGrossMargin > 0) {
      const targetMarginRate = dto.targetGrossMargin / 100;
      const combinedDeductionRate = targetMarginRate + feePct / 100;
      if (combinedDeductionRate < 1) {
        targetPrice = r2(directCost / (1 - combinedDeductionRate));
      }
    }

    const breakEvenPrice =
      feePct < 100 ? r2(directCost / (1 - feePct / 100)) : directCost;

    return {
      salePrice: sale,
      costOfGoods: dto.costOfGoods,
      laborCost: dto.laborCost || 0,
      overheadCost: dto.overheadCost || 0,
      directCost,
      processingFee,
      totalCost,
      profitDollar,
      grossMarginPct,
      markupPct,
      targetPrice,
      breakEvenPrice,
      currency: dto.currency || 'USD',
    };
  }

  /** FT-03: Break-Even Calculator */
  calculateBreakEven(dto: BreakEvenCalculateDto) {
    const fixed = Math.max(0, dto.fixedCosts);
    const price = Math.max(0.01, dto.sellingPricePerUnit);
    const varCost = Math.max(0, dto.variableCostPerUnit);
    const targetProfit = Math.max(0, dto.targetProfit || 0);

    const contributionMargin = r2(price - varCost);
    const possible = contributionMargin > 0;
    const contributionMarginRatio = possible
      ? r4(contributionMargin / price)
      : 0;

    if (!possible) {
      return {
        possible: false,
        reason: 'VARIABLE_COST_EXCEEDS_OR_EQUALS_PRICE',
        message:
          'Selling price per unit must be greater than variable cost per unit to achieve break-even.',
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
        currency: dto.currency || 'USD',
        period: dto.period || 'month',
      };
    }

    const exactBreakEvenUnits = fixed / contributionMargin;
    const breakEvenUnits = Math.ceil(exactBreakEvenUnits);
    const breakEvenRevenue = r2(breakEvenUnits * price);

    const targetExactUnits = (fixed + targetProfit) / contributionMargin;
    const targetProfitUnits = Math.ceil(targetExactUnits);
    const targetProfitRevenue = r2(targetProfitUnits * price);

    // Generate 8 chart points around break-even
    const maxUnits = Math.max(breakEvenUnits * 2, 20);
    const step = Math.max(1, Math.round(maxUnits / 7));
    const chartSeries: {
      units: number;
      revenue: number;
      totalCost: number;
      profit: number;
    }[] = [];
    for (let u = 0; u <= maxUnits; u += step) {
      const rev = r2(u * price);
      const cost = r2(fixed + u * varCost);
      const profit = r2(rev - cost);
      chartSeries.push({ units: u, revenue: rev, totalCost: cost, profit });
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
      currency: dto.currency || 'USD',
      period: dto.period || 'month',
    };
  }

  /** FT-04: Invoice Generator calculations */
  calculateInvoice(dto: InvoiceCalculateDto) {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const computedLines = (dto.lines || []).map((line, idx) => {
      const qty = Math.max(0.001, line.quantity);
      const price = Math.max(0, line.unitPrice);
      const lineGross = r2(qty * price);
      const discPct = Math.min(100, Math.max(0, line.discountPercent || 0));
      const lineDisc = r2(lineGross * (discPct / 100));
      const lineNet = r2(lineGross - lineDisc);
      const taxPct = Math.min(100, Math.max(0, line.taxPercent || 0));
      const lineTax = r2(lineNet * (taxPct / 100));
      const lineTotal = r2(lineNet + lineTax);

      subtotal = r2(subtotal + lineNet);
      totalDiscount = r2(totalDiscount + lineDisc);
      totalTax = r2(totalTax + lineTax);

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

    const totalAmount = r2(subtotal + totalTax);

    return {
      lines: computedLines,
      subtotal,
      totalDiscount,
      totalTax,
      totalAmount,
      currency: dto.currency || 'USD',
      seller: dto.seller || { name: 'Your Business' },
      buyer: dto.buyer || { name: 'Customer' },
      invoiceNumber: dto.invoiceNumber || 'INV-0001',
      issueDate: dto.issueDate || new Date().toISOString().slice(0, 10),
      dueDate:
        dto.dueDate ||
        new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      notes: dto.notes || 'Thank you for your business!',
    };
  }

  /** FT-05: QR Code Generator */
  async encodeQr(dto: QrEncodeDto) {
    let rawPayload = (dto.payload || '').trim();

    if (dto.qrType === 'wifi' && dto.wifi) {
      const enc = dto.wifi.encryption || 'WPA';
      const hidden = dto.wifi.hidden ? 'true' : 'false';
      rawPayload = `WIFI:T:${enc};S:${dto.wifi.ssid};P:${dto.wifi.password || ''};H:${hidden};;`;
    } else if (dto.qrType === 'vcard' && dto.vcard) {
      const v = dto.vcard;
      rawPayload = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${v.lastName || ''};${v.firstName || ''};;;`,
        `FN:${[v.firstName, v.lastName].filter(Boolean).join(' ')}`,
        v.org ? `ORG:${v.org}` : '',
        v.title ? `TITLE:${v.title}` : '',
        v.phone ? `TEL;TYPE=CELL:${v.phone}` : '',
        v.email ? `EMAIL:${v.email}` : '',
        v.url ? `URL:${v.url}` : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\r\n');
    } else if (dto.qrType === 'sms' && dto.phone) {
      rawPayload = `SMSTO:${dto.phone}:${dto.smsMessage || ''}`;
    } else if (dto.qrType === 'phone' && dto.phone) {
      rawPayload = `tel:${dto.phone}`;
    } else if (dto.qrType === 'email' && dto.emailAddress) {
      const params = new URLSearchParams();
      if (dto.emailSubject) params.set('subject', dto.emailSubject);
      if (dto.emailBody) params.set('body', dto.emailBody);
      const q = params.toString();
      rawPayload = `mailto:${dto.emailAddress}${q ? `?${q}` : ''}`;
    }

    if (!rawPayload) {
      throw new BadRequestException('QR payload cannot be empty.');
    }

    const ecLevel = dto.errorCorrection || 'M';
    const darkColor = dto.foregroundColor || '#000000';
    const lightColor = dto.backgroundColor || '#FFFFFF';

    const [svg, dataUrl] = await Promise.all([
      QRCode.toString(rawPayload, {
        type: 'svg',
        errorCorrectionLevel: ecLevel,
        margin: 4,
        color: { dark: darkColor, light: lightColor },
      }),
      QRCode.toDataURL(rawPayload, {
        errorCorrectionLevel: ecLevel,
        margin: 4,
        width: dto.size || 256,
        color: { dark: darkColor, light: lightColor },
      }),
    ]);

    return {
      payload: rawPayload,
      qrType: dto.qrType,
      errorCorrection: ecLevel,
      svg,
      dataUrl,
    };
  }

  /** FT-06: Google Review Link & QR Generator */
  async composeReviewKit(dto: ReviewKitComposeDto) {
    let link = dto.reviewLink.trim();
    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      link = `https://${link}`;
    }

    if (!hasPublicHost(link)) {
      throw new BadRequestException('Invalid Google review URL provided.');
    }

    const business = dto.businessDisplayName.trim();
    const defaultTagline =
      'Your feedback means the world to us and helps local customers discover our work.';

    const cardHeadline = `Love your experience at ${business}?`;
    const cardBody = `${dto.tagline?.trim() || defaultTagline} Scan the QR code below or tap the link to leave an honest review on Google.`;

    const qrResult = await this.encodeQr({
      qrType: 'url',
      payload: link,
      errorCorrection: 'M',
      foregroundColor: '#0A5A44',
      backgroundColor: '#FFFFFF',
      size: 300,
    });

    return {
      reviewLink: link,
      businessDisplayName: business,
      cardHeadline,
      cardBody,
      qrSvg: qrResult.svg,
      qrDataUrl: qrResult.dataUrl,
    };
  }

  /** FT-07: WhatsApp Link Generator */
  async composeWhatsapp(dto: WhatsappComposeDto) {
    let rawNumber = dto.internationalNumber.trim();
    if (!rawNumber.startsWith('+') && !rawNumber.startsWith('00')) {
      rawNumber = `+${rawNumber}`;
    }

    let cleanNumber: string;
    try {
      if (isValidPhoneNumber(rawNumber)) {
        const parsed = parsePhoneNumber(rawNumber);
        cleanNumber = parsed.number.replace(/^\+/, '');
      } else {
        cleanNumber = rawNumber.replace(/[^0-9]/g, '');
      }
    } catch {
      cleanNumber = rawNumber.replace(/[^0-9]/g, '');
    }

    if (!cleanNumber || cleanNumber.length < 7) {
      throw new BadRequestException(
        'Please provide a valid international telephone number with country code.',
      );
    }

    const url = new URL(`https://wa.me/${cleanNumber}`);
    if (dto.prefilledMessage && dto.prefilledMessage.trim()) {
      url.searchParams.set('text', dto.prefilledMessage.trim());
    }

    const finalUrl = url.toString();
    const qrResult = await this.encodeQr({
      qrType: 'url',
      payload: finalUrl,
      errorCorrection: 'M',
      foregroundColor: '#0A5A44',
      backgroundColor: '#FFFFFF',
      size: 260,
    });

    return {
      internationalNumber: cleanNumber,
      fullUrl: finalUrl,
      prefilledMessage: dto.prefilledMessage?.trim() || '',
      qrSvg: qrResult.svg,
      qrDataUrl: qrResult.dataUrl,
    };
  }

  /** FT-08: UTM Campaign Link Builder */
  async composeUtm(dto: UtmComposeDto) {
    let dest = dto.destinationUrl.trim();
    if (!dest.startsWith('http://') && !dest.startsWith('https://')) {
      dest = `https://${dest}`;
    }

    let url: URL;
    try {
      if (!hasPublicHost(dest)) throw new Error('no host');
      url = new URL(dest);
    } catch {
      throw new BadRequestException(
        'Please enter a valid destination website URL.',
      );
    }

    const format = (v?: string) =>
      dto.lowercase && v ? v.toLowerCase().trim() : v ? v.trim() : '';

    const existingTags: string[] = [];
    [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ].forEach((key) => {
      if (url.searchParams.has(key)) {
        existingTags.push(key);
      }
    });

    url.searchParams.set('utm_source', format(dto.utmSource));
    url.searchParams.set('utm_medium', format(dto.utmMedium));
    url.searchParams.set('utm_campaign', format(dto.utmCampaign));

    if (dto.utmTerm?.trim()) {
      url.searchParams.set('utm_term', format(dto.utmTerm));
    }
    if (dto.utmContent?.trim()) {
      url.searchParams.set('utm_content', format(dto.utmContent));
    }

    const finalUrl = url.toString();
    const qrResult = await this.encodeQr({
      qrType: 'url',
      payload: finalUrl,
      errorCorrection: 'M',
      foregroundColor: '#0A5A44',
      backgroundColor: '#FFFFFF',
      size: 260,
    });

    return {
      finalUrl,
      destinationUrl: dest,
      hasExistingUtmConflict: existingTags.length > 0,
      existingTags,
      qrSvg: qrResult.svg,
      qrDataUrl: qrResult.dataUrl,
    };
  }

  /** FT-09: Email Signature Generator */
  renderSignature(dto: SignatureRenderDto) {
    const tpl = dto.template || 'modern';
    const name = dto.fullName.trim();
    const company = dto.companyName.trim();
    const title = dto.jobTitle?.trim() || '';
    const email = dto.email.trim();
    const phone = dto.phone?.trim() || '';
    const website = dto.website?.trim() || '';
    const address = dto.address?.trim() || '';
    const avatar = dto.avatarUrl?.trim() || '';

    let html = '';
    if (tpl === 'modern') {
      html = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.4; color: #1c2a24;">
  <tr>
    ${
      avatar
        ? `<td style="padding-right: 16px; vertical-align: top;"><img src="${avatar}" alt="${name}" width="68" height="68" style="width: 68px; height: 68px; border-radius: 50%; display: block; object-fit: cover;" /></td>`
        : ''
    }
    <td style="border-left: 3px solid #0E7A5A; padding-left: 14px; vertical-align: top;">
      <div style="font-size: 16px; font-weight: bold; color: #0E7A5A; margin-bottom: 2px;">${name}</div>
      ${title ? `<div style="font-size: 13px; color: #556B62; margin-bottom: 4px;">${title}${company ? ` · ${company}` : ''}</div>` : `<div style="font-size: 13px; color: #556B62; margin-bottom: 4px;">${company}</div>`}
      <div style="font-size: 12px; color: #33443C;">
        ${email ? `<a href="mailto:${email}" style="color: #0E7A5A; text-decoration: none;">${email}</a>` : ''}
        ${phone ? ` · <span>${phone}</span>` : ''}
        ${website ? ` · <a href="${website.startsWith('http') ? website : `https://${website}`}" style="color: #0E7A5A; text-decoration: none;">${website}</a>` : ''}
      </div>
      ${address ? `<div style="font-size: 11px; color: #7A8E85; margin-top: 4px;">${address}</div>` : ''}
    </td>
  </tr>
</table>`.trim();
    } else if (tpl === 'minimal') {
      html = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #22332A;">
  <tr>
    <td>
      <div style="font-size: 14px; font-weight: bold; color: #11221A;">${name}</div>
      <div style="color: #66776E;">${title ? `${title} | ` : ''}${company}</div>
      <div style="margin-top: 4px;">
        <a href="mailto:${email}" style="color: #0A5A44; text-decoration: none;">${email}</a>
        ${phone ? ` | ${phone}` : ''}
        ${website ? ` | <a href="${website.startsWith('http') ? website : `https://${website}`}" style="color: #0A5A44; text-decoration: none;">${website}</a>` : ''}
      </div>
    </td>
  </tr>
</table>`.trim();
    } else {
      html = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.4; color: #11221A;">
  <tr>
    <td style="padding-bottom: 6px;">
      <span style="font-size: 15px; font-weight: bold; color: #0A5A44;">${name}</span>
      <span style="color: #66776E;"> — ${title || company}</span>
    </td>
  </tr>
  <tr>
    <td style="border-top: 1px solid #D1DDD7; padding-top: 6px; font-size: 12px; color: #44554C;">
      <a href="mailto:${email}" style="color: #0A5A44; text-decoration: none;">${email}</a>
      ${phone ? ` · ${phone}` : ''}
      ${website ? ` · <a href="${website.startsWith('http') ? website : `https://${website}`}" style="color: #0A5A44; text-decoration: none;">${website}</a>` : ''}
    </td>
  </tr>
</table>`.trim();
    }

    const plainText = [
      name,
      title ? `${title} - ${company}` : company,
      email,
      phone,
      website,
      address,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      template: tpl,
      html,
      plainText,
    };
  }

  /** FT-10: Missed Call Revenue Calculator */
  calculateMissedCallRevenue(dto: MissedCallCalculateDto) {
    const missed = Math.max(0, dto.missedCalls);
    const avgTicket = Math.max(0, dto.averageSaleValue);
    const marginPct = Math.min(100, Math.max(0, dto.grossMarginPct || 45));

    const computeModel = (
      eligRate: number,
      reachRate: number,
      bookRate: number,
      closeRate: number,
    ) => {
      const eligible = r2(missed * (eligRate / 100));
      const reached = r2(eligible * (reachRate / 100));
      const booked = r2(reached * (bookRate / 100));
      const closed = r2(booked * (closeRate / 100));
      const lostRevenueMonthly = r2(closed * avgTicket);
      const lostProfitMonthly = r2(lostRevenueMonthly * (marginPct / 100));
      const lostRevenueAnnual = r2(lostRevenueMonthly * 12);
      const lostProfitAnnual = r2(lostProfitMonthly * 12);

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
      dto.eligibleSharePct ?? 80,
      dto.contactRatePct ?? 50,
      dto.bookingRatePct ?? 40,
      dto.saleClosePct ?? 60,
    );

    const conservative = computeModel(
      Math.max(10, (dto.eligibleSharePct ?? 80) * 0.8),
      Math.max(10, (dto.contactRatePct ?? 50) * 0.7),
      Math.max(10, (dto.bookingRatePct ?? 40) * 0.7),
      Math.max(10, (dto.saleClosePct ?? 60) * 0.8),
    );

    const optimistic = computeModel(
      Math.min(95, (dto.eligibleSharePct ?? 80) * 1.15),
      Math.min(90, (dto.contactRatePct ?? 50) * 1.3),
      Math.min(85, (dto.bookingRatePct ?? 40) * 1.3),
      Math.min(90, (dto.saleClosePct ?? 60) * 1.2),
    );

    return {
      missedCalls: missed,
      averageSaleValue: avgTicket,
      grossMarginPct: marginPct,
      currency: dto.currency || 'USD',
      base,
      conservative,
      optimistic,
    };
  }
}
