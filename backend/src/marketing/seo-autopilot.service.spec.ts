import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SeoAutopilotService } from './seo-autopilot.service';

describe('SeoAutopilotService', () => {
  it('derives keyword metrics from saved rank snapshots without inventing audit data', async () => {
    const now = Date.now();
    const client = {
      seoAuditIssue: {
        count: jest.fn().mockResolvedValue(7),
      },
      trackedKeyword: {
        findMany: jest.fn().mockResolvedValue([
          {
            snapshots: [
              { rank: 4, capturedAt: new Date(now - 60_000) },
              { rank: 9, capturedAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
            ],
          },
          {
            snapshots: [
              { rank: 18, capturedAt: new Date(now - 8 * 24 * 60 * 60 * 1000) },
              { rank: 12, capturedAt: new Date(now - 9 * 24 * 60 * 60 * 1000) },
            ],
          },
          { snapshots: [] },
        ]),
      },
    };
    const service = new SeoAutopilotService({
      client,
    } as unknown as TenantPrismaService);

    const result = await service.overview('business_1');

    expect(client.trackedKeyword.findMany).toHaveBeenCalledWith({
      where: { businessId: 'business_1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        snapshots: {
          orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
          take: 2,
        },
      },
    });
    expect(client.seoAuditIssue.count).toHaveBeenCalledWith({
      where: { businessId: 'business_1', status: 'open' },
    });
    expect(result).toMatchObject({
      trackedKeywords: 3,
      rankedKeywords: 2,
      topTen: 1,
      improving: 1,
      declining: 1,
      needsFreshCheck: 2,
      openAuditIssues: 7,
      dataStatus: 'partial',
    });
    expect(result.unsupported.map(({ key }) => key)).toEqual([
      'search_volume',
      'backlinks',
    ]);
  });
});
