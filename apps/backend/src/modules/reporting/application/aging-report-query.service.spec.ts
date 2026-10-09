import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  AgingBucketCount,
  IAgingReportRepository,
} from './aging-report.repository.port';
import { AgingReportQueryService } from './aging-report-query.service';

describe('AgingReportQueryService', () => {
  function buildService(rows: AgingBucketCount[]) {
    const repo: IAgingReportRepository = {
      findBucketCounts: jest.fn().mockResolvedValue(rows),
    };
    const tenantContext = {
      getOrganizationId: () => 'org-1',
    } as never as TenantContextService;
    const service = new AgingReportQueryService(repo, tenantContext);
    return { service, repo };
  }

  it('returns all 5 buckets in fixed order and zero-fills missing buckets', async () => {
    const { service } = buildService([
      { bucket: 'OVERDUE_1_7', count: 2, totalRemaining: '15000000' },
    ]);

    await expect(service.getAgingBuckets()).resolves.toEqual([
      { bucket: 'NOT_DUE', count: 0, totalRemaining: '0' },
      { bucket: 'OVERDUE_1_7', count: 2, totalRemaining: '15000000' },
      { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: '0' },
      { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: '0' },
      { bucket: 'OVERDUE_60_PLUS', count: 0, totalRemaining: '0' },
    ]);
  });

  it('preserves totals above Number.MAX_SAFE_INTEGER as strings', async () => {
    const totalRemaining = '9007199254740992';
    const { service } = buildService([
      { bucket: 'OVERDUE_1_7', count: 1, totalRemaining },
    ]);

    await expect(service.getAgingBuckets()).resolves.toContainEqual({
      bucket: 'OVERDUE_1_7',
      count: 1,
      totalRemaining,
    });
  });

  it('scopes the repository query by the current tenant organizationId', async () => {
    const { service, repo } = buildService([]);

    await service.getAgingBuckets();

    expect(repo.findBucketCounts).toHaveBeenCalledWith('org-1');
  });
});
