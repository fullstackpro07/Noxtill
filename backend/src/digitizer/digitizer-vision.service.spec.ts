import { AiInfraService } from '../ai/ai-infra.service';
import { CreateMessageParams, CreateMessageResult } from '../ai/claude.client';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerVisionService } from './digitizer-vision.service';
import { DIGITIZER_MODEL } from './digitizer.constants';
import { AppException } from '../common/filters/app.exception';

function textResult(
  text: string,
  stopReason = 'end_turn',
): CreateMessageResult {
  return {
    content: [{ type: 'text', text }],
    stopReason,
    inputTokens: 100,
    outputTokens: 50,
  };
}

describe('DigitizerVisionService (UPD-BE-060)', () => {
  const aiInfra = {
    createMessage: jest.fn<
      ReturnType<AiInfraService['createMessage']>,
      Parameters<AiInfraService['createMessage']>
    >(),
  };
  const aliases = { getMap: jest.fn(), applyAliases: jest.fn() };
  let service: DigitizerVisionService;

  beforeEach(() => {
    jest.clearAllMocks();
    aliases.getMap.mockResolvedValue(new Map());
    aliases.applyAliases.mockImplementation((value: string) => value);
    service = new DigitizerVisionService(
      aiInfra as unknown as AiInfraService,
      aliases as unknown as DigitizerAliasService,
    );
  });

  it('sends a real image content block using the digitizer model', async () => {
    aiInfra.createMessage.mockResolvedValue(textResult('[]'));

    await service.extract(
      'biz-1',
      'receipt',
      Buffer.from('fake-image-bytes'),
      'image/jpeg',
    );

    expect(aiInfra.createMessage).toHaveBeenCalledTimes(1);
    const params: CreateMessageParams = aiInfra.createMessage.mock.calls[0][2];
    expect(params.model).toBe(DIGITIZER_MODEL);
    const content = params.messages[0].content;
    if (typeof content === 'string') throw new Error('expected content blocks');
    expect(content[0].type).toBe('image');
    expect(content[0].source?.media_type).toBe('image/jpeg');
    expect(content[0].source?.data).toBe(
      Buffer.from('fake-image-bytes').toString('base64'),
    );
  });

  it('sends a PDF as a document block, not an image', async () => {
    aiInfra.createMessage.mockResolvedValue(textResult('{"rows": []}'));

    await service.extractDocument(
      'biz-1',
      'invoice',
      Buffer.from('%PDF-1.4'),
      'application/pdf',
      3,
    );

    const params = aiInfra.createMessage.mock.calls[0][2];
    const content = params.messages[0].content;
    if (typeof content === 'string') throw new Error('expected content blocks');
    expect(content[0].type).toBe('document');
    expect(content[0].source?.media_type).toBe('application/pdf');
    const prompt = content[1].text ?? '';
    expect(prompt).toContain('3 pages');
  });

  it('parses real rows, defaults destination per scanner type, and clamps confidence', async () => {
    aiInfra.createMessage.mockResolvedValue(
      textResult(
        JSON.stringify([
          { data: { description: 'Flour', amount: 12.5 }, confidence: 1.4 },
          { data: { description: 'Sugar', amount: 5 }, confidence: -0.2 },
        ]),
      ),
    );

    const rows = await service.extract(
      'biz-1',
      'receipt',
      Buffer.from('x'),
      'image/jpeg',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].destination).toBe('expense'); // receipt's real default
    expect(rows[0].confidence).toBe(1); // clamped
    expect(rows[1].confidence).toBe(0); // clamped
    expect(rows.every((r) => r.action === 'commit' && !r.corrected)).toBe(true);
  });

  it('lets the model pick a destination per row for the "general" scanner type', async () => {
    aiInfra.createMessage.mockResolvedValue(
      textResult(
        JSON.stringify([
          {
            destination: 'supplier',
            data: { name: 'Acme Co' },
            confidence: 0.9,
          },
          {
            destination: 'product',
            data: { name: 'Widget', sellingPrice: 20 },
            confidence: 0.8,
          },
        ]),
      ),
    );

    const rows = await service.extract(
      'biz-1',
      'general',
      Buffer.from('x'),
      'image/png',
    );
    expect(rows.map((r) => r.destination)).toEqual(['supplier', 'product']);
  });

  it('reads the full document report: type, quality, line items, printed totals, page/row/region', async () => {
    aiInfra.createMessage.mockResolvedValue(
      textResult(
        JSON.stringify({
          document: {
            type: 'purchase_invoice',
            typeConfidence: 0.93,
            title: 'Supplier invoice · Zenith Beauty',
            handwriting: 'printed',
            language: 'English',
            quality: {
              legible: true,
              blur: 'none',
              glare: 'mild',
              shadow: 'none',
              skew: 'none',
              cutOff: false,
              notes: null,
            },
            invoiceNumber: 'ZB-0844',
            supplier: 'Zenith Beauty',
            documentDate: '2026-08-28',
            currency: 'PKR',
            lineItems: [
              {
                description: 'Serum',
                quantity: 2,
                unitPrice: 500,
                lineTotal: 1000,
              },
              {
                description: 'Cream',
                quantity: null,
                unitPrice: 300,
                lineTotal: 300,
              },
            ],
            totals: {
              subtotal: null,
              tax: 0,
              discount: null,
              printedTotal: 1400,
            },
          },
          rows: [
            {
              destination: 'expense',
              data: {
                description: 'Zenith Beauty · ZB-0844',
                amount: 1400,
                incurredOn: '2026-08-28',
              },
              fieldConfidence: { amount: 0.95, incurredOn: null },
              confidence: 0.9,
              page: 1,
              row: 1,
              region: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
            },
          ],
        }),
      ),
    );

    const out = await service.extractDocument(
      'biz-1',
      'invoice',
      Buffer.from('x'),
      'image/jpeg',
    );

    expect(out.analysis.documentKind).toBe('purchase_invoice');
    expect(out.analysis.typeConfidence).toBe(0.93);
    expect(out.analysis.quality?.glare).toBe('mild');
    expect(out.analysis.lineItems).toHaveLength(2);
    expect(out.analysis.lineItems[1].quantity).toBeNull(); // an unread value stays null — never filled in
    expect(out.analysis.totals?.printedTotal).toBe(1400);
    expect(out.analysis.extractionModel).toBe(DIGITIZER_MODEL);
    expect(out.rows[0].page).toBe(1);
    expect(out.rows[0].sourceRow).toBe(1);
    expect(out.rows[0].fieldConfidence).toEqual({
      amount: 0.95,
      incurredOn: null,
    });
    expect(out.rows[0].region).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.05 });
  });

  it('drops a region that falls outside the page instead of trusting it', async () => {
    aiInfra.createMessage.mockResolvedValue(
      textResult(
        JSON.stringify({
          rows: [
            {
              destination: 'expense',
              data: { description: 'x', amount: 1 },
              confidence: 0.9,
              region: { x: 5, y: 5, w: 1, h: 1 },
            },
          ],
        }),
      ),
    );
    const out = await service.extractDocument(
      'biz-1',
      'receipt',
      Buffer.from('x'),
      'image/jpeg',
    );
    expect(out.rows[0].region).toBeUndefined();
  });

  it('never fabricates a row: unparseable AI output is an error, not an empty success', async () => {
    aiInfra.createMessage.mockResolvedValue(textResult('this is not json'));

    await expect(
      service.extract('biz-1', 'receipt', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('refuses a truncated reply rather than parsing half a document', async () => {
    aiInfra.createMessage.mockResolvedValue(
      textResult('{"rows": [', 'max_tokens'),
    );

    await expect(
      service.extractDocument(
        'biz-1',
        'receipt',
        Buffer.from('x'),
        'image/jpeg',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('fails cleanly (disclosed gap) when the AI call itself throws', async () => {
    aiInfra.createMessage.mockRejectedValue(
      new Error('ANTHROPIC_API_KEY is not configured'),
    );

    await expect(
      service.extract('biz-1', 'receipt', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('applies learned aliases but keeps the model’s own read in `original`', async () => {
    aliases.getMap.mockResolvedValue(new Map([['Sprte', 'Sprite']]));
    aliases.applyAliases.mockImplementation((value: string) =>
      value === 'Sprte' ? 'Sprite' : value,
    );
    aiInfra.createMessage.mockResolvedValue(
      textResult(
        JSON.stringify([
          {
            destination: 'product',
            data: { name: 'Sprte', sellingPrice: 2 },
            confidence: 0.9,
          },
        ]),
      ),
    );

    const rows = await service.extract(
      'biz-1',
      'product',
      Buffer.from('x'),
      'image/jpeg',
    );
    expect(rows[0].data.name).toBe('Sprite');
    expect(rows[0].original?.name).toBe('Sprte');
  });
});
