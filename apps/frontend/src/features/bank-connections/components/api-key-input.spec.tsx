import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiKeyInput } from './api-key-input';

describe('ApiKeyInput', () => {
  it('masks the API key by default and toggles to plain text', () => {
    render(<ApiKeyInput value="test-key" onChange={() => undefined} />);

    const input = screen.getByLabelText(/Casso Flow API Key/i);
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: /hiện mã api key/i }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
