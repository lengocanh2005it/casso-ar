import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSaveSmtpConfig } from '../api/use-settings';
import type { SmtpConfig, SmtpConfigInput } from '../types';

function getErrorMessage(error: unknown): string {
  const response =
    typeof error === 'object' && error !== null && 'response' in error
      ? error.response
      : null;
  const data =
    typeof response === 'object' && response !== null && 'data' in response
      ? response.data
      : null;
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
  ) {
    return data.message;
  }
  return 'Không thể lưu cấu hình SMTP. Kiểm tra lại thông tin và thử lại.';
}

export function SmtpConfigDialog({
  trigger,
  existingConfig,
}: {
  trigger: ReactNode;
  existingConfig: SmtpConfig | null;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useSaveSmtpConfig();

  useEffect(() => {
    if (!open) return;
    setHost(existingConfig?.host ?? '');
    setPort(existingConfig ? String(existingConfig.port) : '');
    setUsername(existingConfig?.username ?? '');
    setPassword('');
    setFromAddress(existingConfig?.fromAddress ?? '');
    setFormError(null);
  }, [existingConfig, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    saveMutation.reset();

    const input: SmtpConfigInput = {
      host: host.trim(),
      port: Number(port),
      username: username.trim(),
      password,
      fromAddress: fromAddress.trim(),
    };

    saveMutation.mutate(input, {
      onSuccess: () => setOpen(false),
      onError: (error) => setFormError(getErrorMessage(error)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingConfig ? 'Sửa cấu hình SMTP' : 'Cấu hình SMTP'}
          </DialogTitle>
          <DialogDescription>
            Casso sẽ kiểm tra kết nối và gửi một email xác nhận trước khi lưu.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="smtp-host">Máy chủ (host)</Label>
            <Input
              id="smtp-host"
              autoComplete="off"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-port">Cổng (port)</Label>
            <Input
              id="smtp-port"
              type="number"
              inputMode="numeric"
              min="1"
              max="65535"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-username">Tên đăng nhập</Label>
            <Input
              id="smtp-username"
              autoComplete="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-password">Mật khẩu</Label>
            <p className="text-xs text-muted-foreground">
              Luôn phải nhập lại, kể cả khi chỉ sửa các trường khác — Casso
              không lưu lại mật khẩu cũ để hiển thị.
            </p>
            <Input
              id="smtp-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-from-address">Gửi từ (from-address)</Label>
            <Input
              id="smtp-from-address"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={fromAddress}
              onChange={(event) => setFromAddress(event.target.value)}
              required
            />
          </div>
          <InlineFormError message={formError} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? 'Đang kiểm tra kết nối…'
                : 'Lưu cấu hình'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
