import { Prisma } from '@prisma/client';

/** Prisma P2034: "Transaction failed due to a write conflict or a deadlock." */
export function isPrismaDeadlock(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

/**
 * MySQL InnoDB deadlocks (gap locks on `MAX(order_no)`, concurrent review-request
 * writes from sibling Jest workers) are expected under load. Retry the whole
 * callback — Prisma has already rolled the failed transaction back.
 */
export async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isPrismaDeadlock(error) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
    }
  }
  throw lastError;
}
