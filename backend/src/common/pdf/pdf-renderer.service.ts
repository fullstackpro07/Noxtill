import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

export interface PdfPageSize {
  width: string;
  height: string;
}

export interface PngViewport {
  width: number;
  height: number;
}

/** Shared Puppeteer HTML→PDF/PNG renderer, used by invoices (BE-027), credit statements (BE-032), and the QR poster generator. */
@Injectable()
export class PdfRendererService {
  /** Defaults to A4 (unchanged behavior for existing invoice/statement callers) when no pageSize is given. */
  async renderPdf(html: string, pageSize?: PdfPageSize): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf(
        pageSize
          ? {
              width: pageSize.width,
              height: pageSize.height,
              printBackground: true,
            }
          : { format: 'A4' },
      );
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /** `viewport` is in CSS pixels — callers convert their target physical size (mm) to pixels at their chosen DPI. */
  async renderPng(html: string, viewport: PngViewport): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.setContent(html, { waitUntil: 'load' });
      const png = await page.screenshot({ type: 'png' });
      return Buffer.from(png);
    } finally {
      await browser.close();
    }
  }
}
