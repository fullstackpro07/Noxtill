import { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../common/storage/s3.service';
import type { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

// puppeteer (pulled in transitively via PdfRendererService) is ESM-only — same guard used
// throughout this codebase's PDF-touching specs (credit-statement.service.spec.ts, invoice.service.spec.ts).
jest.mock('../common/pdf/pdf-renderer.service', () => ({
  PdfRendererService: jest.fn(),
}));

import { AssistantReportService } from './assistant-report.service';

describe('AssistantReportService', () => {
  let prisma: PrismaService;
  let service: AssistantReportService;
  let businessId: string;
  let userId: string;
  const pdfRenderer = {
    renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
  };
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/assistant-report'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AssistantReportService(
      prisma,
      pdfRenderer as unknown as PdfRendererService,
      s3 as unknown as S3Service,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Report Test Biz',
        slug: `report-test-${Date.now()}`,
      },
    });
    businessId = business.id;

    const user = await prisma.user.create({
      data: {
        name: 'Olivia Smith',
        email: `report-test-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterEach(() => {
    pdfRenderer.renderPdf.mockClear();
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('renders a real PDF from exactly the caller-supplied answer and tool trace, and uploads it', async () => {
    const user: AuthenticatedUser = {
      sub: userId,
      businessId,
      role: 'owner',
      capabilities: [],
    };

    const result = await service.generate(user, {
      question: "How much did we sell today?",
      answer: 'Rs. 12,000 across 4 sales.',
      toolCalls: [
        { name: 'get_revenue_today', input: {}, output: { revenue: 12000, count: 4 } },
      ],
      helpSources: [],
    });

    expect(result).toEqual({ url: 'https://signed.example/assistant-report' });
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('Rs. 12,000 across 4 sales.'),
    );
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('Report Test Biz'),
    );
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('Olivia Smith (owner)'),
    );
    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('Revenue today'),
    );
    expect(s3.uploadAndSign).toHaveBeenCalledWith(
      expect.stringContaining(`assistant-reports/${businessId}/`),
      expect.any(Buffer),
      'application/pdf',
    );
  }, 15_000);

  it('labels a report with no tool calls or help sources honestly, rather than blank', async () => {
    const user: AuthenticatedUser = {
      sub: userId,
      businessId,
      role: 'manager',
      capabilities: [],
    };

    await service.generate(user, {
      question: 'What is Noxtill?',
      answer: 'A small business management platform.',
      toolCalls: [],
      helpSources: [],
    });

    expect(pdfRenderer.renderPdf).toHaveBeenCalledWith(
      expect.stringContaining('General knowledge'),
    );
  }, 15_000);
});
