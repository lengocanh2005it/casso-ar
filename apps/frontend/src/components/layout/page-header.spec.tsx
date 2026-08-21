import { render } from '@testing-library/react';
import { Settings } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { PageHeader } from './page-header';

function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('PageHeader', () => {
  it('renders no page icon when icon is omitted', () => {
    const { container } = renderWithTheme(<PageHeader title="Title" />);
    expect(container.querySelector('.lucide-settings')).toBeNull();
  });

  it('renders the page icon when provided', () => {
    const { container } = renderWithTheme(
      <PageHeader title="Title" icon={Settings} />,
    );
    expect(container.querySelector('.lucide-settings')).not.toBeNull();
  });
});
