import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopilotWelcomeState } from './copilot-welcome-state';

describe('CopilotWelcomeState', () => {
  it('submits the question without its supporting description', () => {
    const onSuggestionClick = vi.fn();
    render(<CopilotWelcomeState onSuggestionClick={onSuggestionClick} />);

    fireEvent.click(screen.getByRole('button', { name: /công nợ cao nhất/i }));

    expect(onSuggestionClick).toHaveBeenCalledWith(
      'Khách hàng nào đang có công nợ cao nhất?',
    );
  });

  it('keeps each welcome suggestion discoverable as a button', () => {
    render(<CopilotWelcomeState onSuggestionClick={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /công nợ cao nhất/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /công nợ quá hạn/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /soạn email nhắc thanh toán/i }),
    ).toBeInTheDocument();
  });

  it('caps its own height so the panel never outgrows a short viewport', () => {
    const { container } = render(
      <CopilotWelcomeState onSuggestionClick={vi.fn()} />,
    );

    expect(container.firstChild).toHaveClass('max-h-full', 'overflow-y-auto');
  });
});
