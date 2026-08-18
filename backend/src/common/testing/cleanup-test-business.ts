import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Sibling processor specs (health-score snapshot, AI insights, CRM jobs) iterate every
 * business in the shared test DB and can insert child rows against this one mid-run.
 * Call after deleting the spec's own rows, before `business.delete`.
 */
export async function deleteCrossTestBusinessRows(
  prisma: PrismaService,
  businessId: string,
): Promise<void> {
  await prisma.healthScoreSnapshot.deleteMany({ where: { businessId } });
  await prisma.aiInsight.deleteMany({ where: { businessId } });
  await prisma.activityEvent.deleteMany({ where: { businessId } });
}
