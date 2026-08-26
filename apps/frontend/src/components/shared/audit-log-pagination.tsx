import { Button } from '@/components/ui/button';

interface AuditLogPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function AuditLogPagination({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: AuditLogPaginationProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="tabular-nums text-sm text-muted-foreground">
        Trang {page} / {totalPages} • {total} nhật ký
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={onPrev}
        >
          Trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}
