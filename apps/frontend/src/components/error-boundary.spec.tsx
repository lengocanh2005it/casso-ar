import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

const CHUNK_ERROR_MESSAGE =
  'Failed to fetch dynamically imported module: http://localhost:5173/src/features/customers/pages/customers-page.tsx?t=1787402090092';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

function renderWithBoom(message: string) {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Boom message={message} />
    </ErrorBoundary>,
  );
  consoleSpy.mockRestore();
}

describe('ErrorBoundary', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('reloads once automatically on the first stale-chunk error', () => {
    renderWithBoom(CHUNK_ERROR_MESSAGE);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows an update-available message and manual reload action if the stale-chunk error persists after the automatic reload', () => {
    sessionStorage.setItem('app-chunk-reload-attempted', '1');

    renderWithBoom(CHUNK_ERROR_MESSAGE);

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/có bản cập nhật mới/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /tải lại trang/i }).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the generic error message and retry action for other errors', () => {
    renderWithBoom('Something exploded');

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/đã xảy ra lỗi/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^thử lại$/i }),
    ).toBeInTheDocument();
  });
});
