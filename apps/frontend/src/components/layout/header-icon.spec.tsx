import { render, screen } from '@testing-library/react';
import { AlertTriangle } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { HeaderIcon } from './header-icon';

describe('HeaderIcon', () => {
  it('uses the requested semantic tone', () => {
    render(<HeaderIcon icon={AlertTriangle} tone="warning" />);

    expect(screen.getByTestId('header-icon')).toHaveClass(
      'text-warning-strong',
    );
  });
});
