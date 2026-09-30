import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService summary', () => {
  it('reports run outcomes without turning skipped runs into successful sends', async () => {
    const workflowCount = jest
      .fn<Promise<number>, [unknown]>()
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3);
    const runCount = jest
      .fn<Promise<number>, [unknown]>()
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(9);
    const latestRunAt = new Date('2026-09-26T13:00:00.000Z');
    const service = new WorkflowsService({
      client: {
        workflow: { count: workflowCount },
        workflowRun: {
          count: runCount,
          findFirst: jest.fn().mockResolvedValue({ createdAt: latestRunAt }),
        },
      },
    } as unknown as TenantPrismaService);

    const summary = await service.summary('business_1');

    expect(summary).toMatchObject({
      totalWorkflows: 8,
      activeWorkflows: 3,
      successfulRuns: 12,
      failedRuns: 3,
      skippedRuns: 5,
      runsLast7Days: 9,
      successRate: 80,
      lastRunAt: latestRunAt,
    });
    expect(summary.unavailableMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'time_saved' }),
        expect.objectContaining({ key: 'revenue_attributed' }),
      ]),
    );
  });
});
