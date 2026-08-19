import { AiInfraService } from '../ai/ai-infra.service';
import {
  CreateMessageParams,
  CreateMessageResult,
  VISION_MODEL,
} from '../ai/claude.client';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerVisionService } from './digitizer-vision.service';
import { AppException } from '../common/filters/app.exception';

function textResult(text: string): CreateMessageResult {
  return {
    content: [{ type: 'text', text }],
    stopReason: 'end_turn',
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

  it('sends a real image content block using the vision-capable model', async () => {
    aiInfra.createMessage.mockResolvedValue(textResult('[]'));

    await service.extract(
      'biz-1',
      'receipt',
      Buffer.from('fake-image-bytes'),
      'image/jpeg',
    );

    expect(aiInfra.createMessage).toHaveBeenCalledTimes(1);
    const params: CreateMessageParams = aiInfra.createMessage.mock.calls[0][2];
    expect(params.model).toBe(VISION_MODEL);
    const content = params.messages[0].content;
    if (typeof content === 'string') throw new Error('expected content blocks');
    expect(content[0].type).toBe('image');
    expect(content[0].source?.media_type).toBe('image/jpeg');
    expect(content[0].source?.data).toBe(
      Buffer.from('fake-image-bytes').toString('base64'),
    );
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

  it('never fabricates a row: unparseable AI output yields an empty result, not an error', async () => {
    aiInfra.createMessage.mockResolvedValue(textResult('this is not json'));

    const rows = await service.extract(
      'biz-1',
      'receipt',
      Buffer.from('x'),
      'image/jpeg',
    );
    expect(rows).toEqual([]);
  });

  it('fails cleanly (disclosed gap) when the AI call itself throws', async () => {
    aiInfra.createMessage.mockRejectedValue(
      new Error('ANTHROPIC_API_KEY is not configured'),
    );

    await expect(
      service.extract('biz-1', 'receipt', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('applies learned aliases to the extracted name field before returning', async () => {
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
  });
});
