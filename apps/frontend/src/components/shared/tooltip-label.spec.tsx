import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

import { TooltipLabel } from './tooltip-label';

describe('TooltipLabel', () => {
  it('reveals the full value on hover instead of a native title bubble', async () => {
    render(
      <TooltipLabel label="Hợp tác xã Nông nghiệp Đồng Tâm">
        <span className="truncate">Hợp tác xã...</span>
      </TooltipLabel>,
    );

    const trigger = screen.getByText('Hợp tác xã...');
    // The native attribute is what produced the second, off-theme bubble.
    expect(trigger).not.toHaveAttribute('title');

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(
        'Hợp tác xã Nông nghiệp Đồng Tâm',
      );
    });
  });

  it('renders the child untouched when there is nothing to reveal', () => {
    render(
      <TooltipLabel label={null}>
        <span>Đã hiện đầy đủ</span>
      </TooltipLabel>,
    );

    expect(screen.getByText('Đã hiện đầy đủ')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('stays closed on keyboard focus and lets Escape dismiss the dialog', async () => {
    function Drawer() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mở
          </button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent accessibleTitle="Ngăn kéo">
              <TooltipLabel label="Đóng ngăn kéo">
                <Button type="button" aria-label="Đóng ngăn kéo">
                  X
                </Button>
              </TooltipLabel>
            </SheetContent>
          </Sheet>
        </>
      );
    }

    render(<Drawer />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở' }));
    await screen.findByRole('dialog', { name: 'Ngăn kéo' });

    // Radix autofocuses the first control, which would otherwise pop the
    // tooltip open. An open tooltip is the top dismissable layer and eats the
    // first Escape, so the drawer used to need two presses to close.
    const trigger = screen
      .getByRole('button', { name: 'Đóng ngăn kéo' })
      .closest('[data-tooltip-trigger]');
    expect(trigger?.getAttribute('data-state')).toBe('closed');

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
});
