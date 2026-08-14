import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { BreakerSwitch } from './breaker-switch';

describe('BreakerSwitch', () => {
  it('renders as a switch with the given aria-checked state and label', () => {
    render(
      <BreakerSwitch
        checked={false}
        onCheckedChange={() => {}}
        label="Lock Acme"
      />,
    );
    const element = screen.getByRole('switch', { name: 'Lock Acme' });
    expect(element).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onCheckedChange when clicked', () => {
    const onCheckedChange = vi.fn();
    render(
      <BreakerSwitch
        checked={false}
        onCheckedChange={onCheckedChange}
        label="Lock Acme"
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Lock Acme' }));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it('reflects checked=true as aria-checked=true', () => {
    render(
      <BreakerSwitch
        checked={true}
        onCheckedChange={() => {}}
        label="Unlock Acme"
      />,
    );
    expect(screen.getByRole('switch', { name: 'Unlock Acme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
