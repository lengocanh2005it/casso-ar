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
import { getResponseErrorMessage } from '../api/settings-api';
import { useSaveSmtpConfig } from '../api/use-settings';
import type { SmtpConfig, SmtpConfigInput } from '../types';

interface FormState {
  host: string;
  port: string;
  username: string;
  password: string;
  fromAddress: string;
}

const emptyForm: FormState = {
  host: '',
  port: '',
  username: '',
  password: '',
  fromAddress: '',
};

export function SmtpConfigDialog({
  trigger,
  existingConfig,
}: {
  trigger: ReactNode;
  existingConfig: SmtpConfig | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useSaveSmtpConfig();

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    if (!open) return;
    // Password is never prefilled — the GET response has no password field
    // to prefill from (the backend never returns it, even encrypted).
    setForm({
      host: existingConfig?.host ?? '',
      port: existingConfig ? String(existingConfig.port) : '',
      username: existingConfig?.username ?? '',
      password: '',
      fromAddress: existingConfig?.fromAddress ?? '',
    });
    setFormError(null);
  }, [existingConfig, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    saveMutation.reset();

    const input: SmtpConfigInput = {
      host: form.host.trim(),
      port: Number(form.port),
      username: form.username.trim(),
      password: form.password,
      fromAddress: form.fromAddress.trim(),
    };

    saveMutation.mutate(input, {
      onSuccess: () => setOpen(false),
      onError: (error) =>
        setFormError(
          getResponseErrorMessage(
            error,
            'Không thể lưu cấu hình SMTP. Kiểm tra lại thông tin và thử lại.',
          ),
        ),
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
              value={form.host}
              onChange={(event) => updateField('host', event.target.value)}
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
              value={form.port}
              onChange={(event) => updateField('port', event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-username">Tên đăng nhập</Label>
            <Input
              id="smtp-username"
              autoComplete="off"
              spellCheck={false}
              value={form.username}
              onChange={(event) => updateField('username', event.target.value)}
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
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
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
              value={form.fromAddress}
              onChange={(event) =>
                updateField('fromAddress', event.target.value)
              }
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
