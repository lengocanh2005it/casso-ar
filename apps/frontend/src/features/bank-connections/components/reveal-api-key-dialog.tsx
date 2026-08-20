import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRevealCassoFlowApiKey } from '../api/use-bank-connections';

export function RevealApiKeyDialog({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const revealMutation = useRevealCassoFlowApiKey();

  const handleSubmit = async () => {
    const result = await revealMutation.mutateAsync({
      authorizationId,
      password,
    });
    setRevealedKey(result.apiKey);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPassword('');
          setRevealedKey(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Hiện API Key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hiện API Key Casso Flow</DialogTitle>
          <DialogDescription>
            Nhập lại mật khẩu tài khoản của bạn để xem API Key đã nhập.
          </DialogDescription>
        </DialogHeader>
        {revealedKey ? (
          <div className="space-y-2">
            <Label htmlFor="revealed-api-key">API Key</Label>
            <Input id="revealed-api-key" readOnly value={revealedKey} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard.writeText(revealedKey)}
            >
              Sao chép
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reveal-password">Mật khẩu</Label>
            <Input
              id="reveal-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Đóng</Button>
          </DialogClose>
          {!revealedKey && (
            <Button
              type="button"
              disabled={revealMutation.isPending || password.length === 0}
              onClick={handleSubmit}
            >
              Xác nhận
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
