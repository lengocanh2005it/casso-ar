import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  const inputId = useId();
  if (totalPages <= 1) return null;

  return (
    <div className="-mx-6 mt-4 flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        Trang {page} / {totalPages}
        {summary ? ` · ${summary}` : ''}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {/* Large lists (hundreds of pages) are unreachable one "Sau" at a time. */}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const typed = Number(
              new FormData(event.currentTarget).get('page') ?? '',
            );
            if (!Number.isInteger(typed)) return;
            onPageChange(Math.min(totalPages, Math.max(1, typed)));
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Đến trang
          </label>
          <Input
            key={page}
            id={inputId}
            name="page"
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            defaultValue={page}
            className="h-8 w-16 text-center tabular-nums"
          />
        </form>
        <Button
          variant="outline"
          size="sm"
          aria-label="Trang đầu"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft aria-hidden="true" className="size-4" />
        </Button>
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
        <Button
          variant="outline"
          size="sm"
          aria-label="Trang cuối"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
