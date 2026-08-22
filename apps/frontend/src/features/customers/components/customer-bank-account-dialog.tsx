import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-client';
import {
  useCreateCustomerBankAccount,
  useUpdateCustomerBankAccount,
} from '../api/use-customers';
import type { CustomerBankAccount } from '../types';

const DUPLICATE_ACCOUNT_HINT =
  'Nếu tài khoản đang vô hiệu hóa, hãy khôi phục tài khoản đó thay vì tạo mới.';

export interface CustomerBankAccountDialogProps {
  customerId: string;
  account?: CustomerBankAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerBankAccountDialog({
  customerId,
  account,
  open,
  onOpenChange,
}: CustomerBankAccountDialogProps) {
  const isEdit = account !== undefined;
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateCustomerBankAccount(customerId);
  const updateMutation = useUpdateCustomerBankAccount(customerId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: account identity changes must reset the edit form
  useEffect(() => {
    if (open) {
      setAccountNumber('');
      setError(null);
    }
  }, [account?.id, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setAccountNumber('');
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  function handleMutationSuccess(message: string) {
    toast.success(message);
    handleOpenChange(false);
  }

  function handleMutationError(mutationError: unknown) {
    const message =
      getApiErrorMessage(mutationError) ?? 'Không thể lưu tài khoản ngân hàng.';
    setError(
      getApiErrorCode(mutationError) === 'CONFLICT'
        ? `${message} ${DUPLICATE_ACCOUNT_HINT}`
        : message,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = accountNumber.trim();

    if (!isEdit) {
      if (trimmed === '') {
        setError('Vui lòng nhập số tài khoản ngân hàng.');
        return;
      }

      setError(null);
      createMutation.mutate(
        { accountNumber: trimmed },
        {
          onSuccess: () =>
            handleMutationSuccess('Đã thêm tài khoản ngân hàng.'),
          onError: handleMutationError,
        },
      );
    } else {
      if (trimmed === '') {
        return;
      }

      setError(null);
      updateMutation.mutate(
        {
          id: account.id,
          input: { accountNumber: trimmed },
        },
        {
          onSuccess: () =>
            handleMutationSuccess('Đã cập nhật tài khoản ngân hàng.'),
          onError: handleMutationError,
        },
      );
    }
  }

  const isPending = isEdit
    ? updateMutation.isPending
    : createMutation.isPending;
  const isSubmitDisabled = isPending || (isEdit && accountNumber.trim() === '');

  const submitText = isEdit
    ? isPending
      ? 'Đang lưu…'
      : 'Lưu thay đổi'
    : isPending
      ? 'Đang thêm…'
      : 'Thêm';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Sửa tài khoản ngân hàng' : 'Thêm tài khoản ngân hàng'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Nhập số tài khoản ngân hàng mới để thay thế số tài khoản hiện tại.'
              : 'Nhập số tài khoản ngân hàng để liên kết với khách hàng.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isEdit && (
            <div className="space-y-1 text-sm">
              <span className="text-muted-foreground">
                Số tài khoản hiện tại:
              </span>
              <p className="font-mono font-medium">
                {account.accountNumberMasked}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="accountNumber">
              {isEdit ? 'Số tài khoản ngân hàng mới' : 'Số tài khoản ngân hàng'}
            </Label>
            <Input
              id="accountNumber"
              aria-label={
                isEdit ? 'Số tài khoản ngân hàng mới' : 'Số tài khoản ngân hàng'
              }
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              onChange={(event) => {
                setAccountNumber(event.target.value);
                setError(null);
              }}
              placeholder={
                isEdit ? 'Nhập số tài khoản mới' : 'Nhập số tài khoản'
              }
            />
          </div>
          {error && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
