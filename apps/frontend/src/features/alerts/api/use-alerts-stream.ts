import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { API_BASE_URL, authTokenManager } from '@/lib/api-client';

export function useAlertsStream(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | undefined;
    let cancelled = false;

    async function connect() {
      const token = await authTokenManager.getValidAccessToken();
      if (cancelled || !token) return;
      source = new EventSource(
        `${API_BASE_URL}/api/v1/alerts/stream?token=${token}`,
      );
      source.onmessage = () => {
        void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      };
    }

    void connect();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [queryClient, enabled]);
}
