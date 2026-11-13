import {
  FREE_SETUP_PAGES,
  STORAGE_PACK_BYTES,
  billableDigitizerPages,
} from './usage.constants';
import { StorageQuotaService } from './storage-quota.service';
import { agentDialTarget } from '../voice/voice-softphone.util';

const BIZ = '11111111-2222-3333-4444-555555555555';
const GB = 1024 ** 3;

describe('billableDigitizerPages (C15: 300 free setup pages)', () => {
  it('spends the free setup pages before the monthly allowance', () => {
    expect(FREE_SETUP_PAGES).toBe(300);
    expect(billableDigitizerPages(0, 250)).toBe(0);
    expect(billableDigitizerPages(0, 340)).toBe(40);
    expect(billableDigitizerPages(200, 150)).toBe(50);
  });

  it('counts every page once the free pages are used up', () => {
    expect(billableDigitizerPages(300, 30)).toBe(30);
    expect(billableDigitizerPages(5000, 12)).toBe(12);
  });
});

describe('StorageQuotaService (C7)', () => {
  const build = (limit: number | null, storedBytes: number | null) =>
    new StorageQuotaService(
      { rootId: () => Promise.resolve(BIZ) } as never,
      {
        planLimit: () =>
          Promise.resolve({ limit, planName: 'Starter' } as never),
      } as never,
      {
        storage: () =>
          Promise.resolve(storedBytes == null ? null : { bytes: storedBytes }),
      } as never,
    );

  it('refuses an upload that would go over the plan allowance', async () => {
    const svc = build(10 * GB, 10 * GB - 100);
    await expect(
      svc.assertCanStore(`media/${BIZ}/photo.jpg`, 1000),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ALLOWANCE_EXHAUSTED',
      }) as unknown,
    });
  });

  it('accepts an upload within the allowance and counts it until re-measured', async () => {
    const svc = build(10 * GB, 10 * GB - 1500);
    await svc.assertCanStore(`media/${BIZ}/a.jpg`, 1000);
    await expect(
      svc.assertCanStore(`media/${BIZ}/b.jpg`, 1000),
    ).rejects.toBeDefined();
  });

  it('never blocks data exports, even when storage is full', async () => {
    const svc = build(10 * GB, 20 * GB);
    await expect(
      svc.assertCanStore(`exports/${BIZ}/data.zip`, 5 * GB),
    ).resolves.toBeUndefined();
  });

  it('does not cap plans without a number, keys outside a business folder, or when unmeasurable', async () => {
    await expect(
      build(null, 900 * GB).assertCanStore(`media/${BIZ}/x`, GB),
    ).resolves.toBeUndefined();
    await expect(
      build(GB, 2 * GB).assertCanStore('system/logo.png', GB),
    ).resolves.toBeUndefined();
    await expect(
      build(GB, null).assertCanStore(`media/${BIZ}/x`, 2 * GB),
    ).resolves.toBeUndefined();
  });

  it('a 100 GB pack is 100 GiB', () => {
    expect(STORAGE_PACK_BYTES).toBe(100 * GB);
  });
});

describe('agentDialTarget (I11: Agent Workspace is the default)', () => {
  it('rings the browser Agent Workspace when the softphone is set up, even if the agent has a phone', () => {
    expect(agentDialTarget('+15125550148', 'b', 'p', true)).toMatch(
      /^client:nx_/,
    );
  });

  it('falls back to the agent phone only when the softphone is not set up', () => {
    expect(agentDialTarget('+15125550148', 'b', 'p', false)).toBe(
      '+15125550148',
    );
    expect(agentDialTarget(null, 'b', 'p', false)).toMatch(/^client:nx_/);
  });
});
