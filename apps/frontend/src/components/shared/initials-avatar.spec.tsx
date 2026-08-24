import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InitialsAvatar } from './initials-avatar';

describe('InitialsAvatar', () => {
  it('renders the same name with the same color every time (deterministic)', () => {
    const { container: first } = render(
      <InitialsAvatar name="Công ty TNHH An Tâm" />,
    );
    const firstClass = first.firstElementChild?.className;

    const { container: second } = render(
      <InitialsAvatar name="Công ty TNHH An Tâm" />,
    );
    const secondClass = second.firstElementChild?.className;

    expect(firstClass).toBe(secondClass);
  });

  it('does not render every name with the identical color', () => {
    const names = [
      'Công ty A',
      'Doanh nghiệp Z',
      'Nguyễn Văn B',
      'Trần Thị C',
      'Công ty TNHH Giải pháp Công nợ An Tâm',
      'Xí nghiệp Sao Việt',
    ];
    const classes = new Set(
      names.map(
        (name) =>
          render(<InitialsAvatar name={name} />).container.firstElementChild
            ?.className,
      ),
    );

    expect(classes.size).toBeGreaterThan(1);
  });

  it('still renders an image when avatarUrl is provided, ignoring color', () => {
    render(
      <InitialsAvatar name="Công ty A" avatarUrl="https://x.test/a.png" />,
    );

    expect(screen.getByRole('img', { name: 'Công ty A' })).toHaveAttribute(
      'src',
      'https://x.test/a.png',
    );
  });
});
