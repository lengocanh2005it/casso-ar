import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CAS_LINK_FAILED_TOAST,
  type CasLinkMessage,
  openCasLinkPopup,
} from '@/lib/cas-link';
import { useConnectCasId, useExchangeCasId } from '../api/use-bank-connections';

const POPUP_CLOSE_POLL_MS = 500;

export function CasIdConnectionFlow({
  onCompleted,
}: {
  onCompleted?: () => void;
}) {
  const [isLinking, setIsLinking] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const settledRef = useRef(false);
  const connectMutation = useConnectCasId();
  const exchangeMutation = useExchangeCasId();

  const clearPopupPoll = useCallback(() => {
    if (popupPollRef.current) {
      clearInterval(popupPollRef.current);
      popupPollRef.current = null;
    }
  }, []);

  function watchPopupClose(popup: Window) {
    clearPopupPoll();
    popupPollRef.current = setInterval(() => {
      if (popup.closed) {
        clearPopupPoll();
        setIsLinking(false);
        if (!settledRef.current) {
          toast.error(CAS_LINK_FAILED_TOAST);
        }
        settledRef.current = false;
      }
    }, POPUP_CLOSE_POLL_MS);
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as CasLinkMessage | undefined;
      if (!payload?.type) return;

      if (payload.type === 'CAS_LINK_CANCELLED') {
        settledRef.current = true;
        popupRef.current?.close();
        clearPopupPoll();
        setIsLinking(false);
        toast.error(CAS_LINK_FAILED_TOAST);
        return;
      }

      if (payload.type === 'CAS_LINK_ERROR') {
        settledRef.current = true;
        popupRef.current?.close();
        clearPopupPoll();
        setIsLinking(false);
        toast.error(payload.message || CAS_LINK_FAILED_TOAST);
        return;
      }

      if (
        payload.type !== 'CAS_LINK_SUCCESS' ||
        !payload.publicToken ||
        !sessionIdRef.current
      ) {
        return;
      }

      settledRef.current = true;
      exchangeMutation.mutate(
        { sessionId: sessionIdRef.current, publicToken: payload.publicToken },
        {
          onSuccess: () => {
            popupRef.current?.close();
            onCompleted?.();
          },
          onSettled: () => {
            clearPopupPoll();
            setIsLinking(false);
          },
        },
      );
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearPopupPoll();
    };
  }, [onCompleted, exchangeMutation.mutate, clearPopupPoll]);

  function handleConnect() {
    settledRef.current = false;
    setIsLinking(true);
    connectMutation.mutate(undefined, {
      onSuccess: (result) => {
        sessionIdRef.current = result.sessionId;
        const popup = openCasLinkPopup(
          result.grantToken,
          result.redirectUri,
          result.linkBaseUrl,
        );
        popupRef.current = popup;
        if (!popup) {
          toast.error(
            'Trình duyệt đã chặn popup. Vui lòng cho phép popup và thử lại.',
          );
          setIsLinking(false);
          return;
        }
        watchPopupClose(popup);
      },
      onError: () => {
        toast.error('Không thể tạo liên kết Cas ID.');
        setIsLinking(false);
      },
    });
  }

  return (
    <Button onClick={handleConnect} disabled={isLinking}>
      {isLinking ? 'Đang mở Cas Link…' : 'Kết nối ngân hàng'}
    </Button>
  );
}
