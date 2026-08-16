import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface SetSearchParamOptions {
  /** Also reset `page` to 1 (filter/search changes invalidate pagination). */
  resetPage?: boolean;
  /** Replace the history entry instead of pushing (search-as-you-type). */
  replace?: boolean;
}

/**
 * Shared "clone params → mutate → setSearchParams" shape used by every list
 * page (search, status filters, pagination, tabs). An empty string removes
 * the param, matching the previous `if (value) set else delete` convention.
 */
export function useUrlQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string, options?: SetSearchParamOptions) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === '') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          if (options?.resetPage) next.set('page', '1');
          return next;
        },
        options?.replace ? { replace: true } : undefined,
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('page', String(page));
        return next;
      });
    },
    [setSearchParams],
  );

  const patch = useCallback(
    (
      mutator: (next: URLSearchParams) => void,
      options?: { replace?: boolean },
    ) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutator(next);
          return next;
        },
        options?.replace ? { replace: true } : undefined,
      );
    },
    [setSearchParams],
  );

  return { searchParams, setParam, setPage, patch };
}
