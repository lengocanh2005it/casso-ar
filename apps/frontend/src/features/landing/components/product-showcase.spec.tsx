import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductShowcase } from './product-showcase';

describe('ProductShowcase', () => {
  it('exposes an anchor target for the landing navigation', () => {
    const { container } = render(<ProductShowcase />);

    expect(container.querySelector('section#san-pham')).toHaveClass(
      'scroll-mt-24',
    );
  });

  it('highlights Casso AR in the showcase heading', () => {
    render(<ProductShowcase />);

    const heading = screen.getByRole('heading', {
      name: 'Xem Casso AR hoạt động',
    });

    expect(screen.getByText('Casso AR')).toHaveClass('text-primary');
    expect(heading).toBeInTheDocument();
  });

  it('shows the first screen by default with a matching image and tab highlighted', () => {
    render(<ProductShowcase />);

    expect(screen.getByText('Không cần nhắc lại')).toBeInTheDocument();
    const image = screen.getByAltText(
      'Giao diện Lịch nhắc tự động của Casso AR',
    );
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', '/showcase-reminders.png');
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

  it('moves one shared green indicator to the active tab', () => {
    render(<ProductShowcase />);

    const indicator = screen.getByTestId('showcase-tab-indicator');
    expect(screen.getByRole('tab', { name: /lịch nhắc/i })).toContainElement(
      indicator,
    );
    expect(screen.getAllByTestId('showcase-tab-indicator')).toHaveLength(1);

    fireEvent.mouseDown(screen.getByRole('tab', { name: /tổng quan/i }), {
      button: 0,
      ctrlKey: false,
    });

    expect(screen.getByRole('tab', { name: /tổng quan/i })).toContainElement(
      screen.getByTestId('showcase-tab-indicator'),
    );
    expect(screen.getAllByTestId('showcase-tab-indicator')).toHaveLength(1);
  });

  it('keeps the active tab label white while hovered', () => {
    render(<ProductShowcase />);

    const activeTab = screen.getByRole('tab', { name: /lịch nhắc/i });
    fireEvent.mouseEnter(activeTab);

    expect(activeTab).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Lịch nhắc')).toHaveClass(
      'group-data-[state=active]:text-primary-foreground',
    );
  });

  it('keeps the active showcase pill green and borderless in dark mode', () => {
    render(<ProductShowcase />);

    const activeTab = screen.getByRole('tab', { name: /lịch nhắc/i });

    expect(activeTab).toHaveClass(
      'dark:data-[state=active]:border-transparent',
      'dark:data-[state=active]:bg-transparent',
      'dark:data-[state=active]:text-primary-foreground',
    );
    expect(screen.getByTestId('showcase-tab-indicator')).toHaveClass(
      'bg-primary',
    );
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

  it('keeps the showcase tabs in one row on narrow screens', () => {
    render(<ProductShowcase />);

    expect(screen.getByRole('tablist')).toHaveClass('flex-nowrap');
  });

  it('activates a tab when it receives focus, so arrow keys can sweep the group', () => {
    // Radix Tabs uses automatic activation: focusing a tab selects it. jsdom
    // cannot run the roving-focus keydown path (it needs real layout), so the
    // keyboard sweep is verified in the browser; this test pins the behavior
    // the sweep depends on.
    render(<ProductShowcase />);

    const copilot = screen.getByRole('tab', { name: /copilot/i });
    act(() => {
      copilot.focus();
      fireEvent.focus(copilot);
    });

    expect(copilot).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Không cần đoán')).toBeInTheDocument();
  });

  it('automatically cycles through screens every 2.5 seconds', () => {
    vi.useFakeTimers();
    const view = render(<ProductShowcase />);

    try {
      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('tab', { name: /tổng quan/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByText('Không cần Excel')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('tab', { name: /copilot/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('tab', { name: /lịch nhắc/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('pauses the automatic cycle while the showcase is hovered', () => {
    vi.useFakeTimers();
    const view = render(<ProductShowcase />);
    const tabList = screen.getByRole('tablist');

    try {
      fireEvent.mouseEnter(tabList);
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole('tab', { name: /lịch nhắc/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      fireEvent.mouseLeave(tabList);
      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('tab', { name: /tổng quan/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('pauses while a tab has keyboard focus, then resumes after focus leaves', () => {
    vi.useFakeTimers();
    const view = render(<ProductShowcase />);
    const copilot = screen.getByRole('tab', { name: /copilot/i });

    try {
      act(() => {
        copilot.focus();
        fireEvent.focus(copilot);
      });
      act(() => vi.advanceTimersByTime(5000));
      expect(copilot).toHaveAttribute('aria-selected', 'true');

      fireEvent.blur(copilot, { relatedTarget: document.body });
      act(() => vi.advanceTimersByTime(2500));
      expect(screen.getByRole('tab', { name: /lịch nhắc/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });
});
