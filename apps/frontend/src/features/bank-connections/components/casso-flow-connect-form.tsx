import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConnectCassoFlow } from '../api/use-bank-connections';

export function CassoFlowConnectForm({
  bankConnectionId,
  onCompleted,
}: {
  bankConnectionId?: string;
  onCompleted?: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const connectMutation = useConnectCassoFlow();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    connectMutation.mutate(
      { apiKey: trimmed, bankConnectionId },
      {
        onSuccess: () => {
          setApiKey('');
          onCompleted?.();
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="casso-api-key">
          <span className="text-primary">Casso Flow</span> API Key
        </Label>
        <Input
          id="casso-api-key"
          type="password"
          placeholder="casso_api_key_..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={connectMutation.isPending}
          autoComplete="off"
          required
        />
        <p className="text-xs text-muted-foreground">
          Bạn có thể xem cách lấy API Key tại{' '}
          <a
            href="https://developer.casso.vn/v1/auth-code/tao-authorization-code-thu-cong"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium pointer-hover:hover:underline"
          >
            đây
          </a>
          .
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={!apiKey.trim() || connectMutation.isPending}
        >
          {connectMutation.isPending
            ? 'Đang kết nối…'
            : bankConnectionId
              ? 'Kết nối lại'
              : 'Kết nối'}
        </Button>
      </div>
    </form>
  );
}
