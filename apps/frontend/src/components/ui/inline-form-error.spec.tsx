import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineFormError } from './inline-form-error';

describe('InlineFormError', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<InlineFormError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the message as an alert and moves focus to it', () => {
    render(<InlineFormError message="Email hoặc mật khẩu không đúng." />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveFocus();
  });
});
