import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductShowcase } from './product-showcase';

describe('ProductShowcase', () => {
  it('shows the first screen by default with a matching image and tab highlighted', () => {
    render(<ProductShowcase />);

    expect(screen.getByText('Không cần nhắc lại')).toBeInTheDocument();
    const image = screen.getByAltText(
      'Giao diện Lịch nhắc tự động của Casso AR',
    );
    expect(image).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /lịch nhắc/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches screen, title, and image when another tab is clicked', () => {
    render(<ProductShowcase />);

    fireEvent.click(screen.getByRole('tab', { name: /copilot/i }));

    expect(screen.getByText('Không cần đoán')).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Giao diện Copilot — trợ lý AI thu hồi công nợ của Casso AR',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không cần nhắc lại')).not.toBeInTheDocument();
  });

  it('renders one tab per showcase screen', () => {
    render(<ProductShowcase />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});
