import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCsvExport } from './use-csv-export';

const downloadCsv = vi.fn();
const toastWarning = vi.fn();
const toastError = vi.fn();

vi.mock('./download-csv', () => ({
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe('useCsvExport', () => {
  it('downloads the CSV and tracks the pending state', async () => {
    const { result } = renderHook(() => useCsvExport());
    expect(result.current.isExporting).toBe(false);

    act(() => {
      void result.current.exportCsv(
        () => Promise.resolve({ csv: 'a,b\n1,2' }),
        'test.csv',
      );
    });
    expect(result.current.isExporting).toBe(true);

    await waitFor(() => expect(result.current.isExporting).toBe(false));
    expect(downloadCsv).toHaveBeenCalledWith('a,b\n1,2', 'test.csv');
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('warns when the export was truncated', async () => {
    const { result } = renderHook(() => useCsvExport());

    await act(() =>
      result.current.exportCsv(
        () => Promise.resolve({ csv: 'a,b\n1,2', truncated: true }),
        'test.csv',
      ),
    );

    expect(toastWarning).toHaveBeenCalledWith(
      'Chỉ xuất 10.000 dòng đầu, vui lòng lọc bớt để xuất đầy đủ.',
    );
  });

  it('shows an error toast when the export request fails', async () => {
    const { result } = renderHook(() => useCsvExport());

    await act(() =>
      result.current.exportCsv(
        () => Promise.reject(new Error('network error')),
        'test.csv',
      ),
    );

    expect(toastError).toHaveBeenCalledWith('Không thể xuất CSV.');
    expect(result.current.isExporting).toBe(false);
  });
});
