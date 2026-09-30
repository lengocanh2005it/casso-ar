import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardPagination } from './card-pagination';

describe('CardPagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(
      <CardPagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    );

    // "Trang 1 / 1" with two disabled buttons was pure noise.
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the position with an optional summary and moves between pages', () => {
    const onPageChange = vi.fn();
    render(
      <CardPagination
        page={2}
        totalPages={6}
        summary="112 thay đổi"
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText('Trang 2 / 6 · 112 thay đổi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });

  it('jumps straight to the first and last page', () => {
    const onPageChange = vi.fn();
    render(
      <CardPagination
        page={150}
        totalPages={300}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trang đầu' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Trang cuối' }));
    expect(onPageChange).toHaveBeenLastCalledWith(300);
  });

  it('jumps to a typed page number, clamped to the valid range', () => {
    const onPageChange = vi.fn();
    render(
      <CardPagination page={1} totalPages={300} onPageChange={onPageChange} />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Đến trang' });

    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.submit(input);
    expect(onPageChange).toHaveBeenLastCalledWith(120);

    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.submit(input);
    expect(onPageChange).toHaveBeenLastCalledWith(300);
  });

  it('disables the edge buttons on the first and last page', () => {
    render(<CardPagination page={3} totalPages={3} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trước' })).toBeEnabled();
  });
});
