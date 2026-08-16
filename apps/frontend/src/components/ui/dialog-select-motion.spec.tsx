import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

describe('dialog and select motion preferences', () => {
  it('disables motion for reduced-motion users and gates touch hover styles', () => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Confirm</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogContent>
        </Dialog>
        <Select open value="one" onValueChange={() => {}}>
          <SelectTrigger aria-label="Choice">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one">One</SelectItem>
          </SelectContent>
        </Select>
      </>,
    );

    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass(
      'motion-reduce:animate-none',
    );
    expect(document.querySelector('[data-slot="dialog-content"]')).toHaveClass(
      'motion-reduce:animate-none',
      'overscroll-contain',
    );
    expect(document.querySelector('[data-slot="dialog-close"]')).toHaveClass(
      'pointer-hover:hover:opacity-100',
      'focus-visible:ring-2',
    );
    expect(
      document.querySelector('[data-slot="dialog-close"] svg'),
    ).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[data-slot="select-trigger"]')).toHaveClass(
      'dark:pointer-hover:hover:bg-input/50',
    );
    expect(document.querySelector('[data-slot="select-content"]')).toHaveClass(
      'motion-reduce:animate-none',
    );
    expect(
      document.querySelector('[data-slot="select-trigger"] svg'),
    ).toHaveAttribute('aria-hidden', 'true');
  });
});
