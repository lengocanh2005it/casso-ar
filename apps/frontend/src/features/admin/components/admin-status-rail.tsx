import { useEffect, useState } from 'react';
import { listOrganizations } from '../api/admin-api';

export function AdminStatusRail() {
  const [total, setTotal] = useState<number | null>(null);
  const [locked, setLocked] = useState<number | null>(null);

  useEffect(() => {
    void listOrganizations(1, 100).then((result) => {
      setTotal(result.total);
      setLocked(result.items.filter((org) => org.status === 'LOCKED').length);
    });
  }, []);

  return (
    <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        <span className="font-mono tabular-nums">{total ?? '–'}</span>{' '}
        organizations
      </span>
      {locked !== null && locked > 0 && (
        <span className="flex items-center gap-1.5 text-destructive">
          <span aria-hidden>⚠</span>
          <span className="font-mono tabular-nums">{locked}</span> locked
        </span>
      )}
      <span className="ml-auto font-medium text-muted-foreground">
        Casso Admin
      </span>
    </div>
  );
}
