import { AiInfraService } from '../ai/ai-infra.service';
import { DEFAULT_MODEL, VISION_MODEL } from '../ai/claude.client';
import { AssistantAttachmentService } from './attachment.service';
import { ATTACHMENT_AI_CALL_KIND } from './attachment.constants';

describe('AssistantAttachmentService vision model', () => {
  it('uses the configured, cost-accounted vision model for image attachments', async () => {
    const createMessage = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'recognized image text' }],
    });
    const service = new AssistantAttachmentService({
      createMessage,
    } as unknown as AiInfraService);

    const result = await service.extract('business-id', {
      originalname: 'receipt.png',
      mimetype: 'image/png',
      size: 4,
      buffer: Buffer.from('image'),
    } as Express.Multer.File);

    expect(VISION_MODEL).toBe(DEFAULT_MODEL);
    expect(result.text).toBe('recognized image text');
    expect(createMessage).toHaveBeenCalledWith(
      'business-id',
      ATTACHMENT_AI_CALL_KIND,
      expect.objectContaining({ model: DEFAULT_MODEL }),
    );
  });
});
