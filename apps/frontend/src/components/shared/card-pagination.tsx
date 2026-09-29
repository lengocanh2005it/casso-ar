import { Button } from '@/components/ui/button';

// Footer strip for a list inside a Card/SectionCard (bleeds to the card's
// px-6 edges). Every list page uses this one so pagination sits in the same
// place everywhere; a single page renders nothing.
export function CardPagination({
  page,
  totalPages,
  summary,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  summary?: string;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="-mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        Trang {page} / {totalPages}
        {summary ? ` · ${summary}` : ''}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}
