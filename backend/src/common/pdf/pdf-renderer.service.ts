import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

/** Shared Puppeteer HTML→PDF renderer, used by invoices (BE-027) and credit statements (BE-032). */
@Injectable()
export class PdfRendererService {
  async renderPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({ format: 'A4' });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
