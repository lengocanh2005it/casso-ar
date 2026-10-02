import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductShowcase } from './product-showcase';

describe('ProductShowcase', () => {
  it('shows the first screen by default with a matching image and tab highlighted', () => {
    render(<ProductShowcase />);

    expect(screen.getByText('Không cần nhắc lại')).toBeInTheDocument();
    const image = screen.getByAltText(
      'Giao diện Lịch nhắc tự động của Casso AR',
    );
    expect(image).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /lịch nhắc/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches screen, title, and image when another tab is clicked', () => {
    render(<ProductShowcase />);

    // Radix Tabs activate on mousedown, not click, so `fireEvent.click` alone
    // leaves the panel unchanged.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /copilot/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByText('Không cần đoán')).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Giao diện Copilot — trợ lý AI thu hồi công nợ của Casso AR',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không cần nhắc lại')).not.toBeInTheDocument();
  });

  it('renders one tab per showcase screen', () => {
    render(<ProductShowcase />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('wires each tab to the panel it controls', () => {
    // A hand-rolled `role="tab"` with no `aria-controls` breaks the ARIA
    // contract: assistive tech announces a tab with nothing to reveal.
    render(<ProductShowcase />);

    const [first] = screen.getAllByRole('tab');
    const panelId = first.getAttribute('aria-controls');

    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeInTheDocument();
  });

  it('sizes the tab bar to fit its triggers so the pills are not clipped', () => {
    // The base TabsList pins itself to `h-9` (36px) and clips overflow on Y.
    // The pill triggers are 38px tall, so the top and bottom 1px of every
    // pill was cut off and they read as squashed together. The bar now lets
    // its height follow the triggers and stops clipping them.
    render(<ProductShowcase />);

    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('overflow-visible');
    expect(list).toHaveClass('group-data-[orientation=horizontal]/tabs:h-auto');
  });

  it('gives every tab the 44px touch target the header nav already uses', () => {
    // The pills rendered 38px tall, below the 44px the rest of the page's
    // controls use and below the 44px touch-target guidance (WCAG 2.5.5).
    render(<ProductShowcase />);

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('min-h-11');
    }
  });

  it('activates a tab when it receives focus, so arrow keys can sweep the group', () => {
    // Radix Tabs uses automatic activation: focusing a tab selects it. jsdom
    // cannot run the roving-focus keydown path (it needs real layout), so the
    // keyboard sweep is verified in the browser; this test pins the behavior
    // the sweep depends on.
    render(<ProductShowcase />);

    const copilot = screen.getByRole('tab', { name: /copilot/i });
    copilot.focus();
    fireEvent.focus(copilot);

    expect(copilot).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Không cần đoán')).toBeInTheDocument();
  });
});
