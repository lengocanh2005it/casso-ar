import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge destructive', () => {
  it('keeps a solid fill so the label stays readable in dark mode', () => {
    render(<Badge variant="destructive">Quá hạn</Badge>);

    const badge = screen.getByText('Quá hạn');
    const cls = String(badge.className);

    // dark:bg-destructive/60 composites to 3.17 against --destructive-foreground
    // (near-black) — below the 4.5 floor for 12px text. Solid fill measures
    // 6.62 and is what the light theme already does.
    expect(cls).not.toMatch(/dark:bg-destructive\/\d+/);
  });
});
