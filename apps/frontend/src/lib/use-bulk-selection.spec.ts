import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBulkSelection } from './use-bulk-selection';

describe('useBulkSelection', () => {
  it('toggles individual ids and reports allSelected only when every visible id is selected', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b']));

    expect(result.current.selectedIds).toEqual([]);
    act(() => result.current.toggle('a'));
    expect(result.current.selectedIds).toEqual(['a']);
    expect(result.current.allSelected).toBe(false);
    act(() => result.current.toggle('b'));
    expect(result.current.allSelected).toBe(true);
  });

  it('toggleAll selects everything then clears on the next call', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b']));

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.sort()).toEqual(['a', 'b']);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
  });

  it('drops a previously selected id once it leaves the current page (pagination/search change)', () => {
    const { result, rerender } = renderHook(
      ({ ids }) => useBulkSelection(ids),
      { initialProps: { ids: ['a', 'b'] } },
    );

    act(() => result.current.toggle('a'));
    expect(result.current.selectedIds).toEqual(['a']);

    rerender({ ids: ['c', 'd'] });
    expect(result.current.selectedIds).toEqual([]);
  });

  it('drop removes only the given ids, keeping the rest selected', () => {
    const { result } = renderHook(() => useBulkSelection(['a', 'b', 'c']));

    act(() => result.current.toggleAll());
    act(() => result.current.drop(['b']));
    expect(result.current.selectedIds.sort()).toEqual(['a', 'c']);
  });
});
