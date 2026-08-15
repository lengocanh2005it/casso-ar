import { useParams, useSearchParams } from 'react-router-dom';
import type { AdminMemberStatusFilter } from '../api/admin-api';
import { useAdminOrganization, useOrganizationMembers } from '../api/use-admin';

const MEMBER_PAGE_SIZE = 50;

export function AdminOrganizationMembersPage() {
  const { organizationId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const status = (searchParams.get('status') ??
    'ALL') as AdminMemberStatusFilter;
  const search = searchParams.get('search') ?? '';

  const organizationQuery = useAdminOrganization(organizationId);
  useOrganizationMembers(
    organizationId,
    page,
    MEMBER_PAGE_SIZE,
    status,
    search,
  );

  if (organizationQuery.isPending) {
    return (
      <p role="status" aria-live="polite">
        Đang tải tổ chức…
      </p>
    );
  }

  if (organizationQuery.isError) {
    return (
      <p role="alert" aria-live="polite" className="text-sm text-destructive">
        Không thể tải tổ chức. Vui lòng thử lại.
      </p>
    );
  }

  const organization = organizationQuery.data;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">ADMIN CONSOLE</p>
        <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
          {organization.name}
        </h1>
      </header>
    </div>
  );
}
