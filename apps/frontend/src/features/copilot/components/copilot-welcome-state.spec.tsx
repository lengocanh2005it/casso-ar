import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopilotWelcomeState } from './copilot-welcome-state';

describe('CopilotWelcomeState', () => {
  it('invokes onSuggestionClick with the clicked suggestion text', () => {
    const onSuggestionClick = vi.fn();
    render(<CopilotWelcomeState onSuggestionClick={onSuggestionClick} />);

    const button = screen.getAllByRole('button')[0];
    fireEvent.click(button);

    expect(onSuggestionClick).toHaveBeenCalledWith(button.textContent);
  });

  it('keeps each welcome suggestion discoverable as a button', () => {
    render(<CopilotWelcomeState onSuggestionClick={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /tóm tắt công nợ/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /công nợ quá hạn/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /soạn email nhắc thanh toán/i }),
    ).toBeInTheDocument();
  });
});
