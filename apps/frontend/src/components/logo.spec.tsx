import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './logo';

describe('Logo', () => {
  it('renders the icon plus the "Casso Ledger" wordmark by default', () => {
    render(<Logo />);
    expect(screen.getByTitle('CASSO')).toBeInTheDocument();
    expect(screen.getByText('Casso Ledger')).toBeInTheDocument();
  });

  it('renders only the icon mark with no wordmark when variant="icon"', () => {
    render(<Logo variant="icon" />);
    expect(screen.getByTitle('CASSO')).toBeInTheDocument();
    expect(screen.queryByText('Casso Ledger')).not.toBeInTheDocument();
  });

  it('renders the wordmark in the brand green by default', () => {
    render(<Logo />);
    expect(screen.getByText('Casso Ledger')).toHaveClass('text-primary');
  });
});
