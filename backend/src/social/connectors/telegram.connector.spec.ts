import axios from 'axios';
import { TelegramConnector } from './telegram.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TelegramConnector (UPD-BE-045, via TokenBasedConnector)', () => {
  const connector = new TelegramConnector();

  afterEach(() => jest.clearAllMocks());

  it('authUrl() returns null — no OAuth flow for a bot token', () => {
    expect(connector.authUrl()).toBeNull();
  });

  it('handleCallback() verifies the submitted bot token via a real getMe call', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { result: { id: 12345, username: 'my_business_bot' } },
    });
    const result = await connector.handleCallback('real-bot-token');
    expect(result.accessToken).toBe('real-bot-token');
    expect(result.externalAccountId).toBe('12345');
    expect(result.externalAccountName).toBe('my_business_bot');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.telegram.org/botreal-bot-token/getMe',
    );
  });

  it('publish() sends a real photo message when media is present, else a text message', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { result: { message_id: 42 } },
    });
    const result = await connector.publish(
      { accessToken: 'bot-token' },
      { caption: 'New arrivals!', mediaUrls: ['https://example.com/pic.jpg'] },
      { chatId: '-100123' },
    );
    expect(result.externalId).toBe('42');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendPhoto',
      expect.objectContaining({ chat_id: '-100123', caption: 'New arrivals!' }),
    );
  });

  it('fetchInbox() encodes chatId:messageId into externalId; replyToInboxItem() decodes it back', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        result: [
          {
            update_id: 1,
            message: {
              message_id: 7,
              text: 'Are you open Sunday?',
              from: { username: 'customer1' },
              chat: { id: 999 },
              date: 1700000000,
            },
          },
        ],
      },
    });
    const inbox = await connector.fetchInbox({ accessToken: 'bot-token' }, {});
    expect(inbox[0].externalId).toBe('999:7');

    mockedAxios.post.mockResolvedValue({ data: {} });
    await connector.replyToInboxItem(
      { accessToken: 'bot-token' },
      { externalId: '999:7' },
      'Yes, 10am-2pm!',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/botbot-token/sendMessage',
      { chat_id: '999', text: 'Yes, 10am-2pm!', reply_to_message_id: 7 },
    );
  });

  it('fetchInsights() uses getChatMemberCount as the real followers proxy', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: 350 } });
    const insights = await connector.fetchInsights(
      { accessToken: 'bot-token' },
      { chatId: '-100123' },
    );
    expect(insights.followers).toBe(350);
  });
});
