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
const STABLE_STREAM_MS = 15_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      // Otherwise one listener per reconnect piles up on the signal.
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// `streamScope` identifies whose alerts the stream carries (e.g.
// `${userId}:${organizationId}`); null disables streaming. Tabs share one
// stream per scope, so another account or organization open in the same
// browser gets its own stream instead of queuing behind the first one.
export function useAlertsStream(streamScope: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!streamScope) return;

    const lockName = `${STREAM_LOCK_NAME}:${streamScope}`;
    const controller = new AbortController();
    const { signal } = controller;
    const invalidateAlerts = () =>
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    // Only one tab holds the stream (see the lock below); it relays each
    // message here so every other tab refreshes its alerts too.
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(lockName);
    if (channel) channel.onmessage = invalidateAlerts;

    // 'stable' (the stream stayed open a while) lets a healthy connection
    // that later drops reconnect quickly; a stream that closes right after
    // opening counts as 'failed' so it backs off. 'signed-out' ends the loop
    // so a logged-out tab stops calling refresh.
    async function connectOnce(): Promise<'stable' | 'failed' | 'signed-out'> {
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

        const openedAt = Date.now();
        const refreshEveryTab = () => {
          invalidateAlerts();
          channel?.postMessage('alert');
        };
        // Alerts raised while no stream was open (backoff, or another tab
        // taking over the lock) never arrive as messages; refetch on open.
        refreshEveryTab();
        await consumeAlertStream(response.body, signal, refreshEveryTab);
        return Date.now() - openedAt >= STABLE_STREAM_MS ? 'stable' : 'failed';
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
          outcome === 'stable'
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
      navigator.locks.request(lockName, { signal }, run).catch(() => undefined);
    } else {
      void run();
    }

    return () => {
      controller.abort();
      channel?.close();
    };
  }, [queryClient, streamScope]);
}
