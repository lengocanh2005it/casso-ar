import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

describe('Dialog', () => {
  it('localizes both close controls', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Thông tin</DialogTitle>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    expect(
      screen.getByRole('button', { name: 'Đóng hộp thoại' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
  });

  it('returns focus to the opener when a controlled dialog closes', async () => {
    function ControlledDialog() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Details</DialogTitle>
              </DialogHeader>
              <button type="button" onClick={() => setOpen(false)}>
                Done
              </button>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    render(<ControlledDialog />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));

    await waitFor(() => expect(opener).toHaveFocus());
  });
});
