import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_TRANSACTIONS } from '../landing-data';
import { AboutDemoCard } from './about-demo-card';

describe('AboutDemoCard', () => {
  it('shows the matched transaction reconciled against a paid receivable', () => {
    render(<AboutDemoCard />);

    expect(screen.getAllByText(DEMO_TRANSACTIONS[0].customer)).toHaveLength(2);
    expect(screen.getByText('Đã thu đủ')).toBeInTheDocument();
  });
});
