import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet, SheetContent, SheetTrigger } from './sheet';

describe('Sheet', () => {
  it('opens content from an asChild trigger and closes from the overlay', () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button type="button">Open</button>
        </SheetTrigger>
        <SheetContent>Content</SheetContent>
      </Sheet>,
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Content')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.fixed.inset-0') as Element);
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });
});
