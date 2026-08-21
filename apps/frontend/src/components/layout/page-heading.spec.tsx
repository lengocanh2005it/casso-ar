import { render } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { PageHeading } from './page-heading';

describe('PageHeading', () => {
  it('renders no icon when icon is omitted', () => {
    const { container } = render(
      <PageHeading eyebrow="EYEBROW" title="Title" />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the icon when provided', () => {
    const { container } = render(
      <PageHeading eyebrow="EYEBROW" title="Title" icon={Users} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
