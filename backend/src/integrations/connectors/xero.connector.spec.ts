import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@prisma/client';
import axios from 'axios';
import { XeroConnector } from './xero.connector';

describe('XeroConnector', () => {
  const connector = new XeroConnector({
    get: (key: string) =>
      key === 'XERO_CLIENT_ID'
        ? 'xero-client-id'
        : key === 'BACKEND_URL'
          ? 'https://api.noxtill.test/api/v1'
          : undefined,
  } as unknown as ConfigService);
  const tokens = { accessToken: 'access-token' };

  afterEach(() => jest.restoreAllMocks());

  it('requests invoice read and write scopes for the existing Xero invoice sync', () => {
    const url = new URL(connector.authUrl('signed-state'));
    const scopes = url.searchParams.get('scope')?.split(' ') ?? [];

    expect(connector.provider).toBe(IntegrationProvider.xero);
    expect(scopes).toContain('accounting.invoices.read');
    expect(scopes).toContain('accounting.invoices');
    expect(scopes).toContain('accounting.contacts');
    expect(scopes).toContain('accounting.banktransactions.read');
    expect(scopes).not.toContain('accounting.transactions');
  });

  it('reads a bounded authorized invoice page without returning contact fields', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        Invoices: [
          {
            Type: 'ACCREC',
            Status: 'AUTHORISED',
            AmountDue: '100.00',
            CurrencyCode: 'USD',
            DueDateString: '2026-10-01T00:00:00',
            Contact: { Name: 'Private customer' },
          },
        ],
      },
    });

    const result = await connector.getAuthorizedOpenInvoicesPage(
      tokens,
      'xero-tenant',
      'ACCREC',
      2,
    );

    const request = get.mock.calls[0];
    expect(request?.[0]).toBe('https://api.xero.com/api.xro/2.0/Invoices');
    expect(request?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'Xero-tenant-id': 'xero-tenant',
      Accept: 'application/json',
    });
    expect(request?.[1]?.params).toEqual({
      where: 'Type=="ACCREC" AND Status=="AUTHORISED"',
      summaryOnly: true,
      page: 2,
    });
    expect(result).toEqual([
      expect.objectContaining({
        type: 'ACCREC',
        status: 'AUTHORISED',
        amountDue: '100.00',
        currencyCode: 'USD',
      }),
    ]);
    expect(result[0]).not.toHaveProperty('Contact');
  });

  it('reads only bounded bank transaction fields and uses the authorized date filter', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        BankTransactions: [
          {
            Status: 'AUTHORISED',
            Type: 'SPEND',
            Total: '45.25',
            CurrencyCode: 'USD',
            IsReconciled: false,
            Contact: { Name: 'Private supplier' },
            BankAccount: { Name: 'Private account' },
          },
        ],
      },
    });

    const result = await connector.getAuthorizedBankTransactionsPage(
      tokens,
      'xero-tenant',
      2,
      '2026-10-01',
      '2026-10-30',
    );

    const request = get.mock.calls[0];
    expect(request?.[0]).toBe(
      'https://api.xero.com/api.xro/2.0/BankTransactions',
    );
    expect(request?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'Xero-tenant-id': 'xero-tenant',
      Accept: 'application/json',
    });
    expect(request?.[1]?.params).toEqual({
      where:
        'Status=="AUTHORISED" AND Date>=DateTime(2026,10,1) AND Date<=DateTime(2026,10,30)',
      page: 2,
      pageSize: 100,
    });
    expect(result).toEqual([
      {
        status: 'AUTHORISED',
        type: 'SPEND',
        total: '45.25',
        currencyCode: 'USD',
        isReconciled: false,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('Private supplier');
    expect(JSON.stringify(result)).not.toContain('Private account');
  });
});
