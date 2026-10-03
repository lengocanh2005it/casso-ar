import { render, screen } from '@testing-library/react';
import { Palette } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from './section-heading';

describe('SectionHeading', () => {
  it('renders the heading and description on a distinct surface', () => {
    const { container } = render(
      <SectionHeading
        icon={Palette}
        title="Giao diện"
        description="Chọn chế độ hiển thị cho ứng dụng."
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Giao diện' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Chọn chế độ hiển thị cho ứng dụng.'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="section-heading"]'),
    ).toHaveClass('rounded-lg', 'border', 'bg-card');
  });
});
