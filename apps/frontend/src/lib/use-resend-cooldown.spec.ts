import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResendCooldown } from './use-resend-cooldown';

const STORAGE_KEY = 'test:resend-cooldown';

describe('useResendCooldown', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no cooldown', () => {
    const { result } = renderHook(() => useResendCooldown(STORAGE_KEY));
    expect(result.current.remainingSeconds).toBe(0);
  });

  it('starts a 30s cooldown after a successful resend', async () => {
    const { result } = renderHook(() => useResendCooldown(STORAGE_KEY));

    await act(() => result.current.triggerResend(() => Promise.resolve()));

    expect(result.current.remainingSeconds).toBe(30);
  });

  it('counts down every second and reaches 0', async () => {
    const { result } = renderHook(() => useResendCooldown(STORAGE_KEY));
    await act(() => result.current.triggerResend(() => Promise.resolve()));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.remainingSeconds).toBe(0);
  });

  it('escalates 30 -> 60 -> 120 -> 300 and caps at 300', async () => {
    const { result } = renderHook(() => useResendCooldown(STORAGE_KEY));

    for (const expected of [30, 60, 120, 300, 300]) {
      await act(() => result.current.triggerResend(() => Promise.resolve()));
      expect(result.current.remainingSeconds).toBe(expected);
      act(() => {
        vi.advanceTimersByTime(expected * 1000);
      });
    }
  });

  it('does not advance the cooldown when the resend request fails', async () => {
    const { result } = renderHook(() => useResendCooldown(STORAGE_KEY));

    await expect(
      act(() =>
        result.current.triggerResend(() => Promise.reject(new Error('boom'))),
      ),
    ).rejects.toThrow('boom');

    expect(result.current.remainingSeconds).toBe(0);
  });

  it('persists the cooldown across remount (page refresh)', async () => {
    const first = renderHook(() => useResendCooldown(STORAGE_KEY));
    await act(() =>
      first.result.current.triggerResend(() => Promise.resolve()),
    );
    first.unmount();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    const second = renderHook(() => useResendCooldown(STORAGE_KEY));
    expect(second.result.current.remainingSeconds).toBe(20);
  });

  it('reset clears the cooldown and escalation for the next flow', async () => {
    const { result } = renderHook(() => useResendCooldown(STORAGE_KEY));
    await act(() => result.current.triggerResend(() => Promise.resolve()));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    await act(() => result.current.triggerResend(() => Promise.resolve()));
    expect(result.current.remainingSeconds).toBe(60);

    act(() => {
      result.current.reset();
    });
    expect(result.current.remainingSeconds).toBe(0);

    await act(() => result.current.triggerResend(() => Promise.resolve()));
    expect(result.current.remainingSeconds).toBe(30);
  });
});
