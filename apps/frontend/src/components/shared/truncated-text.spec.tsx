import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TruncatedName, TruncatedText } from './truncated-text';

describe('TruncatedName', () => {
  it('clips to one line without every caller having to add `block`', () => {
    render(<TruncatedName name="Công ty TNHH Một Thành viên Rất Dài" />);

    // `truncate` only clips on a block-level box. On an inline span the
    // overflow escapes the cell and the text paints over the next column.
    expect(screen.getByText('Công ty TNHH Một Thành viên Rất Dài')).toHaveClass(
      'block',
    );
  });

  // Hovering used to raise two popups: the browser's native `title` bubble and
  // the Radix tooltip, both showing the same string. One affordance only.
  it('does not stack a native title tooltip under the Radix one', async () => {
    render(<TruncatedName name="Công ty TNHH Giải pháp Kho vận Việt Trung" />);

    const trigger = screen.getByText(
      'Công ty TNHH Giải pháp Kho vận Việt Trung',
    );
    expect(trigger).not.toHaveAttribute('title');

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Công ty TNHH Giải pháp Kho vận Việt Trung',
    );
  });

  // An already-visible value has nothing to reveal, so it must not open a
  // tooltip that would only repeat the text underneath the cursor.
  it('leaves unclipped content alone', () => {
    render(
      <TruncatedText value="Đã hiện đầy đủ">Đã hiện đầy đủ</TruncatedText>,
    );

    expect(screen.getByText('Đã hiện đầy đủ')).not.toHaveAttribute('title');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
