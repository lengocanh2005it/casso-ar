import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useUrlQueryParams } from './use-url-query-params';

function renderWithParams(initialSearch = '?page=2&status=OPEN') {
  let searchParamsState: URLSearchParams;
  const hook = renderHook(
    () => {
      const params = useUrlQueryParams();
      searchParamsState = params.searchParams;
      return { params };
    },
    {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={[`/list${initialSearch}`]}>
          {children}
        </MemoryRouter>
      ),
    },
  );
  return {
    result: hook.result,
    getSearch: () => searchParamsState.toString(),
  };
}

describe('useUrlQueryParams', () => {
  it('setParam sets a value and keeps unrelated params', () => {
    const { result, getSearch } = renderWithParams();

    act(() => result.current.params.setParam('search', 'abc'));

    expect(getSearch()).toBe('page=2&status=OPEN&search=abc');
  });

  it('setParam deletes the key when the value is empty', () => {
    const { result, getSearch } = renderWithParams('?page=2&search=abc');

    act(() => result.current.params.setParam('search', ''));

    expect(getSearch()).toBe('page=2');
  });

  it('setParam resets page to 1 when resetPage is set', () => {
    const { result, getSearch } = renderWithParams('?page=3&search=abc');

    act(() =>
      result.current.params.setParam('search', 'xyz', { resetPage: true }),
    );

    expect(getSearch()).toBe('page=1&search=xyz');
  });

  it('setPage replaces only the page param', () => {
    const { result, getSearch } = renderWithParams('?page=2&search=abc');

    act(() => result.current.params.setPage(5));

    expect(getSearch()).toBe('page=5&search=abc');
  });

  it('patch applies the mutator atomically over a clone', () => {
    const { result, getSearch } = renderWithParams('?page=2&status=OPEN');

    act(() =>
      result.current.params.patch((next) => {
        next.set('status', 'PAID');
        next.delete('page');
      }),
    );

    expect(getSearch()).toBe('status=PAID');
  });
});
