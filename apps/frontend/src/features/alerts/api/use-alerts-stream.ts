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
    await reader.cancel();
  }
}

export function useAlertsStream(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const controller = new AbortController();

    async function connect() {
      const token = await authTokenManager.getValidAccessToken();
      if (cancelled || !token) return;

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/alerts/stream`, {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        await consumeAlertStream(
          response.body,
          controller.signal,
          () => void queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        );
      } catch {
        if (!cancelled && !controller.signal.aborted) return;
      }
    }

    void connect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [queryClient, enabled]);
}
