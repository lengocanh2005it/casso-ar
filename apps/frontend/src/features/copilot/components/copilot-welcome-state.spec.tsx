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
});
