import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './logo';

describe('Logo', () => {
  it('renders the full lockup by default with an accessible title', () => {
    render(<Logo />);
    expect(screen.getByTitle('CASSO LEDGER')).toBeInTheDocument();
  });

  it('renders the icon-only mark when variant="icon"', () => {
    render(<Logo variant="icon" />);
    expect(screen.getByTitle('CASSO')).toBeInTheDocument();
  });
});
