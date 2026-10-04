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

  it('keeps the ai tone visually distinct from brand', () => {
    const { unmount } = render(<HeaderIcon icon={AlertTriangle} tone="ai" />);

    // The two used to resolve to the same classes, which made analytics and
    // AI pages read as the same surface as the landing page.
    expect(screen.getByTestId('header-icon')).toHaveClass('text-info');
    expect(screen.getByTestId('header-icon')).not.toHaveClass('text-primary');
    unmount();

    render(<HeaderIcon icon={AlertTriangle} tone="brand" />);
    expect(screen.getByTestId('header-icon')).toHaveClass('text-primary');
  });
});
