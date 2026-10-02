import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TruncatedCopyId } from './truncated-copy-id';

describe('TruncatedCopyId', () => {
  it('gives the copy control a hover and focus affordance', () => {
    render(<TruncatedCopyId id="abcdef1234567890" />);

    const trigger = screen.getByRole('button');
    const cls = String(trigger.className);

    // It sits inside table cells and inline prose, so it needs both a pointer
    // hover and a visible focus ring to read as interactive.
    expect(cls).toMatch(/hover:/);
    expect(cls).toMatch(/focus-visible:ring-/);
  });
});
