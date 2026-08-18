import { Prisma } from '@prisma/client';
import { withDeadlockRetry } from './prisma-transaction-retry.util';

function deadlock(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict or a deadlock.',
    { code: 'P2034', clientVersion: 'test' },
  );
}

describe('withDeadlockRetry', () => {
  it('returns on the first success', async () => {
    await expect(withDeadlockRetry(() => Promise.resolve(7))).resolves.toBe(7);
  });

  it('retries a P2034 deadlock and then succeeds', async () => {
    let calls = 0;
    const result = await withDeadlockRetry(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(deadlock());
      return Promise.resolve('ok');
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry a non-deadlock error', async () => {
    await expect(
      withDeadlockRetry(() => Promise.reject(new Error('nope'))),
    ).rejects.toThrow('nope');
  });
});
