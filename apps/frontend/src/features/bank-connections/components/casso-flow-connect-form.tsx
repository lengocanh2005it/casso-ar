import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConnectCassoFlow } from '../api/use-bank-connections';

export function CassoFlowConnectForm({
  onCompleted,
}: {
  onCompleted?: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const connectMutation = useConnectCassoFlow();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    connectMutation.mutate(
      { apiKey: trimmed },
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
        <Label htmlFor="casso-api-key">Casso Flow API Key</Label>
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
          Lấy API Key trong phần Cài đặt tích hợp tại trang quản trị Casso Flow.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={!apiKey.trim() || connectMutation.isPending}
        >
          {connectMutation.isPending ? 'Đang kết nối…' : 'Kết nối'}
        </Button>
      </div>
    </form>
  );
}
