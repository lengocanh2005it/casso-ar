import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TruncatedName } from './truncated-text';

describe('TruncatedName', () => {
  it('clips to one line without every caller having to add `block`', () => {
    render(<TruncatedName name="Công ty TNHH Một Thành viên Rất Dài" />);

    // `truncate` only clips on a block-level box. On an inline span the
    // overflow escapes the cell and the text paints over the next column.
    expect(screen.getByText('Công ty TNHH Một Thành viên Rất Dài')).toHaveClass(
      'block',
    );
  });
});
