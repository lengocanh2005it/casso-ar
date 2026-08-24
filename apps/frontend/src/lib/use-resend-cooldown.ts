import { useCallback, useEffect, useState } from 'react';

const COOLDOWN_SCHEDULE_SECONDS = [30, 60, 120, 300];

interface StoredCooldown {
  stepIndex: number;
  cooldownUntil: number;
}

function readStoredCooldown(storageKey: string): StoredCooldown | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCooldown;
  } catch {
    return null;
  }
}

function computeRemainingSeconds(cooldownUntil: number): number {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

function readRemainingSeconds(storageKey: string): number {
  const stored = readStoredCooldown(storageKey);
  return stored ? computeRemainingSeconds(stored.cooldownUntil) : 0;
}

export function useResendCooldown(storageKey: string) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    readRemainingSeconds(storageKey),
  );

  useEffect(() => {
    const tick = () => setRemainingSeconds(readRemainingSeconds(storageKey));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [storageKey]);

  const triggerResend = useCallback(
    async (resendFn: () => Promise<void>) => {
      await resendFn();

      const stored = readStoredCooldown(storageKey);
      const stepIndex = stored
        ? Math.min(stored.stepIndex, COOLDOWN_SCHEDULE_SECONDS.length - 1)
        : 0;
      const cooldownUntil =
        Date.now() + COOLDOWN_SCHEDULE_SECONDS[stepIndex] * 1000;

      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ stepIndex: stepIndex + 1, cooldownUntil }),
      );
      setRemainingSeconds(computeRemainingSeconds(cooldownUntil));
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setRemainingSeconds(0);
  }, [storageKey]);

  return { remainingSeconds, triggerResend, reset };
}
