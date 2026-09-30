import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_BASE_URL, authTokenManager } from '@/lib/api-client';

async function consumeAlertStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onMessage: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];
  // Unblock a pending read() on abort so the stream lock is released and
  // another tab can take over.
  const cancelOnAbort = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', cancelOnAbort, { once: true });

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          if (dataLines.length > 0) {
            onMessage();
            dataLines = [];
          }
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    await reader.cancel().catch(() => undefined);
  }
}

const STREAM_LOCK_NAME = 'casso-ar:alerts-stream';
const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function useAlertsStream(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const { signal } = controller;
    const invalidateAlerts = () =>
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    // Only one tab holds the stream (see the lock below); it relays each
    // message here so every other tab refreshes its alerts too.
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(STREAM_LOCK_NAME);
    if (channel) channel.onmessage = invalidateAlerts;

    // 'connected' lets a healthy stream that later drops reconnect quickly;
    // 'signed-out' ends the loop so a logged-out tab stops calling refresh.
    async function connectOnce(): Promise<
      'connected' | 'failed' | 'signed-out'
    > {
      const token = await authTokenManager.getValidAccessToken();
      if (!token) return 'signed-out';
      if (signal.aborted) return 'failed';

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/alerts/stream`, {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          signal,
        });

        if (!response.ok || !response.body) return 'failed';

        await consumeAlertStream(response.body, signal, () => {
          invalidateAlerts();
          channel?.postMessage('alert');
        });
        return 'connected';
      } catch {
        return 'failed';
      }
    }

    // A backend restart or proxy idle timeout ends the stream; keep the
    // alerts live instead of silently going stale until a page reload.
    async function run() {
      let delay = MIN_RECONNECT_DELAY_MS;
      while (!signal.aborted) {
        const outcome = await connectOnce();
        if (signal.aborted || outcome === 'signed-out') return;
        delay =
          outcome === 'connected'
            ? MIN_RECONNECT_DELAY_MS
            : Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
        await sleep(delay, signal);
      }
    }

    // One stream per browser, not per tab: every open stream pins one of the
    // ~6 HTTP/1.1 connections Chrome allows per host, so six tabs starved all
    // other API requests. Other tabs queue on the lock and take over when the
    // holding tab closes (aborting a queued request rejects it — ignored).
    if ('locks' in navigator) {
      navigator.locks
        .request(STREAM_LOCK_NAME, { signal }, run)
        .catch(() => undefined);
    } else {
      void run();
    }

    return () => {
      controller.abort();
      channel?.close();
    };
  }, [queryClient, enabled]);
}
