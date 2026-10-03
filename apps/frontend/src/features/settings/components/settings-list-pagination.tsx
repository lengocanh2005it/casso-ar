import { Button } from '@/components/ui/button';

interface SettingsListPaginationProps {
  page: number;
  total: number;
  limit: number;
  label: string;
  onPageChange: (page: number) => void;
}

export function SettingsListPagination({
  page,
  total,
  limit,
  label,
  onPageChange,
}: SettingsListPaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const visiblePage = Math.min(page, totalPages);
  const start = (visiblePage - 1) * limit + 1;
  const end = Math.min(visiblePage * limit, total);

  return (
    <div className="-mx-6 mt-4 flex flex-col gap-3 border-t bg-muted/20 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite" className="tabular-nums text-muted-foreground">
        Hiển thị {start}–{end} / {total} {label}
      </p>
      {totalPages > 1 && (
        <nav
          aria-label={`Phân trang ${label}`}
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            variant="outline"
            size="sm"
            aria-label={`Trang ${label} trước`}
            disabled={visiblePage <= 1}
            onClick={() => onPageChange(visiblePage - 1)}
          >
            Trước
          </Button>
          <span className="px-1 text-muted-foreground tabular-nums">
            Trang {visiblePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Trang ${label} tiếp theo`}
            disabled={visiblePage >= totalPages}
            onClick={() => onPageChange(visiblePage + 1)}
          >
            Sau
          </Button>
        </nav>
      )}
    </div>
  );
}
