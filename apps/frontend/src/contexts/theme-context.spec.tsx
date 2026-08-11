import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './theme-context';

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
      <button type="button" onClick={() => setTheme('system')}>
        system
      </button>
    </div>
  );
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('defaults to system mode and resolves dark when the OS prefers dark', () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('resolves light when the OS prefers light', () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme persists the choice and applies the class', () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('dark'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('casso-ledger:theme')).toBe('dark');
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('setTheme light removes the class even when the OS prefers dark', () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('light'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('casso-ledger:theme')).toBe('light');
  });

  it('restores a persisted theme on mount', () => {
    mockMatchMedia(false);
    localStorage.setItem('casso-ledger:theme', 'dark');

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows OS changes while in system mode', () => {
    const mediaQueryList = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    };
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mediaQueryList),
    });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('resolved').textContent).toBe('light');

    const listener = mediaQueryList.addEventListener.mock.calls[0][1] as (
      event: Event,
    ) => void;
    mediaQueryList.matches = true;
    act(() => listener(new Event('change')));

    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
