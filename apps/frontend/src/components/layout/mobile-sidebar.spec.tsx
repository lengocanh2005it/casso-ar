import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileSidebarWrapper } from './mobile-sidebar';

describe('MobileSidebarWrapper', () => {
  it('keeps the drawer width aligned with the sidebar content', () => {
    render(
      <MobileSidebarWrapper>
        <div>Sidebar content</div>
      </MobileSidebarWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));

    expect(screen.getByRole('dialog')).toHaveClass(
      'w-64',
      'max-w-[calc(100vw-1rem)]',
    );
  });
});
