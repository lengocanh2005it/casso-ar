import { useAdminOrganizationStatus } from '../api/use-admin';

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function AdminStatusRail() {
  const organizationQuery = useAdminOrganizationStatus();
  const total = organizationQuery.data?.total ?? null;
  const locked = organizationQuery.data
    ? organizationQuery.data.items.filter((org) => org.status === 'LOCKED')
        .length
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-100"
    >
      {organizationQuery.isError ? (
        <span className="text-destructive">
          Không thể tải trạng thái tổ chức. Vui lòng tải lại trang.
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sky-400" aria-hidden />
            <span className="font-mono tabular-nums">
              {total === null ? '–' : numberFormatter.format(total)}
            </span>{' '}
            organizations
          </span>
          {locked !== null && locked > 0 && (
            <span className="flex items-center gap-1.5 text-destructive">
              <span aria-hidden>⚠</span>
              <span className="font-mono tabular-nums">
                {numberFormatter.format(locked)}
              </span>{' '}
              locked
            </span>
          )}
        </>
      )}
      <span className="ml-auto font-medium text-slate-400">
        <span translate="no">Casso Admin</span>
      </span>
    </div>
  );
}
