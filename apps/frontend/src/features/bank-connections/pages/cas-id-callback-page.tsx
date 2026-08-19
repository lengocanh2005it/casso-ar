import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  CAS_LINK_FAILED_TOAST,
  parseCasLinkCallback,
  postCasLinkMessageToOpener,
} from '@/lib/cas-link';
import { useExchangeCasId } from '../api/use-bank-connections';

export function CasIdCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const exchangeMutation = useExchangeCasId();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const result = parseCasLinkCallback(searchParams.toString());
    if (postCasLinkMessageToOpener(result)) {
      window.close();
      return;
    }

    const goBack = () => navigate('/bank-connections', { replace: true });

    if (result.status === 'cancelled') {
      toast.error(CAS_LINK_FAILED_TOAST);
      goBack();
      return;
    }

    if (result.status === 'error') {
      toast.error(result.message || CAS_LINK_FAILED_TOAST);
      goBack();
      return;
    }

    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      toast.error(CAS_LINK_FAILED_TOAST);
      goBack();
      return;
    }

    exchangeMutation.mutate(
      { sessionId, publicToken: result.publicToken },
      { onSettled: goBack },
    );
  }, [searchParams, navigate, exchangeMutation.mutate]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Đang xử lý liên kết ngân hàng</CardTitle>
          <CardDescription>Vui lòng đợi trong giây lát…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Hoàn tất callback Cas Link
        </CardContent>
      </Card>
    </div>
  );
}
