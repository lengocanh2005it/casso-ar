import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CustomerAgingFilters,
  CustomerAgingPage,
  ICustomerAgingReportRepository,
} from './customer-aging-report.repository.port';
import { CustomerAgingReportQueryService } from './customer-aging-report-query.service';

describe('CustomerAgingReportQueryService', () => {
  const repoPage: CustomerAgingPage = {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
  };

  function buildService(tenantId = 'org-1') {
    const repo: ICustomerAgingReportRepository = {
      findPage: jest.fn().mockResolvedValue(repoPage),
    };
    const tenantContext = {
      getOrganizationId: () => tenantId,
      getCurrentUser: () => undefined,
    } as never as TenantContextService;
    const service = new CustomerAgingReportQueryService(repo, tenantContext);
    return { service, repo };
  }

  it('passes page, limit, search, and bucket with the current tenant', async () => {
    const { service, repo } = buildService();

    await service.getCustomerAging({
      page: 2,
      limit: 20,
      search: 'ACME',
      bucket: 'OVERDUE_60_PLUS',
    });

    expect(repo.findPage).toHaveBeenCalledWith('org-1', {
      page: 2,
      limit: 20,
      search: 'ACME',
      bucket: 'OVERDUE_60_PLUS',
    });
  });

  it('delegates filters without a search or bucket', async () => {
    const { service, repo } = buildService();

    await service.getCustomerAging({ page: 1, limit: 20 });

    expect(repo.findPage).toHaveBeenCalledWith('org-1', {
      page: 1,
      limit: 20,
    });
  });

  it('returns the repository page unchanged', async () => {
    const { service } = buildService();

    await expect(
      service.getCustomerAging({
        page: 1,
        limit: 20,
      } satisfies CustomerAgingFilters),
    ).resolves.toBe(repoPage);
  });
});
