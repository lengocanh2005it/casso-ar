import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

describe('Tooltip', () => {
  it('reveals the full value on hover without adding a keyboard stop', async () => {
    // The full string already sits in the DOM — truncate is visual only — so a
    // tooltip is pointer convenience. It must not become an extra tab stop for
    // keyboard users on every truncated row in a table.
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>Công ty TNHH Thương mại Dịch vụ Hoàng Gia</span>
          </TooltipTrigger>
          <TooltipContent>
            Công ty TNHH Thương mại Dịch vụ Hoàng Gia
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.pointerMove(screen.getByText(/Hoàng Gia/));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Hoàng Gia');
    // The trigger stays a non-focusable span: a table row of truncated names
    // would otherwise add one tab stop per name.
    expect(document.querySelector('[data-tooltip-trigger]')).toHaveProperty(
      'tagName',
      'SPAN',
    );
    expect(
      document.querySelector('[data-tooltip-trigger]'),
    ).not.toHaveAttribute('tabindex');
  });
});
