import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('provides touch and hover feedback and supports a pending state', () => {
    render(
      <BreakerSwitch
        checked={false}
        onCheckedChange={() => {}}
        label="Lock Acme"
        disabled
      />,
    );

    const element = screen.getByRole('switch', { name: 'Lock Acme' });
    expect(element).toBeDisabled();
    expect(element).toHaveClass('touch-manipulation');
    expect(element).toHaveClass('pointer-hover:hover:bg-accent');
    expect(element).toHaveClass(
      'transition-[background-color,border-color,transform]',
    );
    expect(element).toHaveClass(
      'duration-150',
      'ease-out',
      'active:scale-[0.97]',
    );
  });
});
