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
import {
  getApiErrorCode,
  getApiErrorDetails,
  getApiErrorMessage,
} from '@/lib/api-client';
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

function readLinkedCustomerNames(error: unknown): string[] | undefined {
  const names = getApiErrorDetails(error)?.linkedCustomerNames;
  return Array.isArray(names) && names.every((n) => typeof n === 'string')
    ? (names as string[])
    : undefined;
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
  const [crossCustomerNames, setCrossCustomerNames] = useState<string[] | null>(
    null,
  );

  const createMutation = useCreateCustomerBankAccount(customerId);
  const updateMutation = useUpdateCustomerBankAccount(customerId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: account identity changes must reset the edit form
  useEffect(() => {
    if (open) {
      setAccountNumber('');
      setError(null);
      setCrossCustomerNames(null);
    }
  }, [account?.id, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setAccountNumber('');
      setError(null);
      setCrossCustomerNames(null);
    }
    onOpenChange(nextOpen);
  }

  function handleMutationSuccess(message: string) {
    toast.success(message);
    handleOpenChange(false);
  }

  function handleMutationError(mutationError: unknown) {
    const code = getApiErrorCode(mutationError);
    const names =
      code === 'CONFLICT' ? readLinkedCustomerNames(mutationError) : undefined;
    if (names && names.length > 0) {
      setCrossCustomerNames(names);
      setError(null);
      return;
    }

    const message =
      getApiErrorMessage(mutationError) ?? 'Không thể lưu tài khoản ngân hàng.';
    setError(
      code === 'CONFLICT' ? `${message} ${DUPLICATE_ACCOUNT_HINT}` : message,
    );
  }

  function submit(acknowledgeExistingLinks: boolean) {
    const trimmed = accountNumber.trim();
    if (trimmed === '') {
      if (!isEdit) setError('Vui lòng nhập số tài khoản ngân hàng.');
      return;
    }
    setError(null);
    // Only send the flag once the user has confirmed the cross-customer link —
    // an absent flag reads as "not acknowledged" on the backend.
    const ack = acknowledgeExistingLinks
      ? { acknowledgeExistingLinks: true as const }
      : {};
    if (isEdit && account) {
      updateMutation.mutate(
        {
          id: account.id,
          input: { accountNumber: trimmed, ...ack },
        },
        {
          onSuccess: () =>
            handleMutationSuccess('Đã cập nhật tài khoản ngân hàng.'),
          onError: handleMutationError,
        },
      );
    } else {
      createMutation.mutate(
        { accountNumber: trimmed, ...ack },
        {
          onSuccess: () =>
            handleMutationSuccess('Đã thêm tài khoản ngân hàng.'),
          onError: handleMutationError,
        },
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(false);
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
        {crossCustomerNames ? (
          <div className="space-y-4">
            <p className="text-sm">
              Số tài khoản này đang liên kết với:{' '}
              {crossCustomerNames.join(', ')}. Vẫn liên kết với khách hàng này?
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCrossCustomerNames(null)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => submit(true)}
              >
                Vẫn liên kết
              </Button>
            </DialogFooter>
          </div>
        ) : (
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
                {isEdit
                  ? 'Số tài khoản ngân hàng mới'
                  : 'Số tài khoản ngân hàng'}
              </Label>
              <Input
                id="accountNumber"
                aria-label={
                  isEdit
                    ? 'Số tài khoản ngân hàng mới'
                    : 'Số tài khoản ngân hàng'
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
        )}
      </DialogContent>
    </Dialog>
  );
}
