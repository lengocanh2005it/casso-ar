import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConnectCasId, useExchangeCasId } from '../api/use-bank-connections';

export function CasIdConnectionFlow({
  onCompleted,
}: {
  onCompleted?: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [grantToken, setGrantToken] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState('');
  const connectMutation = useConnectCasId();
  const exchangeMutation = useExchangeCasId();

  function handleConnect() {
    connectMutation.mutate(undefined, {
      onSuccess: (result) => {
        setSessionId(result.sessionId);
        setGrantToken(result.grantToken);
      },
      onError: () => toast.error('Không thể tạo liên kết Cas ID.'),
    });
  }

  function handleExchange() {
    if (!sessionId || !publicToken.trim()) return;
    exchangeMutation.mutate(
      { sessionId, publicToken: publicToken.trim() },
      { onSuccess: onCompleted },
    );
  }

  if (grantToken) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center rounded-lg border p-4">
          <QRCodeSVG value={grantToken} size={200} />
        </div>
        <p className="text-sm text-muted-foreground">
          Sau khi quét, nhập public token do Cas ID trả về.
        </p>
        <Input
          name="publicToken"
          autoComplete="off"
          aria-label="Public token"
          placeholder="Public token…"
          value={publicToken}
          onChange={(event) => setPublicToken(event.target.value)}
        />
        <Button
          className="w-full"
          onClick={handleExchange}
          disabled={!publicToken.trim() || exchangeMutation.isPending}
        >
          Hoàn tất kết nối
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleConnect} disabled={connectMutation.isPending}>
      Tạo liên kết kết nối
    </Button>
  );
}
