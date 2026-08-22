import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import {
  useCustomerBankAccounts,
  useDeactivateCustomerBankAccount,
  useUpdateCustomerBankAccount,
} from '../api/use-customers';
import type { CustomerBankAccount } from '../types';
import { CustomerBankAccountDialog } from './customer-bank-account-dialog';

interface CreateDialogState {
  mode: 'create';
  account?: undefined;
}

interface EditDialogState {
  mode: 'edit';
  account: CustomerBankAccount;
}

type DialogState = CreateDialogState | EditDialogState;

interface ConfirmState {
  action: 'deactivate' | 'reactivate';
  account: CustomerBankAccount;
}

interface CustomerBankAccountsCardProps {
  customerId: string;
}

export function CustomerBankAccountsCard({
  customerId,
}: CustomerBankAccountsCardProps) {
  const { user } = useAuth();
  const canManage = hasPermission(
    user?.role ?? null,
    Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
  );

  const query = useCustomerBankAccounts(customerId);
  const deactivateMutation = useDeactivateCustomerBankAccount(customerId);
  const updateMutation = useUpdateCustomerBankAccount(customerId);

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const isConfirmPending =
    deactivateMutation.isPending || updateMutation.isPending;

  function handleConfirmError() {
    toast.error('Không thể cập nhật tài khoản ngân hàng.');
  }

  function handleConfirm() {
    if (!confirmState) return;

    if (confirmState.action === 'deactivate') {
      deactivateMutation.mutate(confirmState.account.id, {
        onSuccess: () => {
          setConfirmState(null);
          toast.success('Đã vô hiệu hóa tài khoản ngân hàng.');
        },
        onError: handleConfirmError,
      });
    } else {
      updateMutation.mutate(
        {
          id: confirmState.account.id,
          input: { isActive: true },
        },
        {
          onSuccess: () => {
            setConfirmState(null);
            toast.success('Đã khôi phục tài khoản ngân hàng.');
          },
          onError: handleConfirmError,
        },
      );
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Tài khoản ngân hàng</CardTitle>
          {canManage && (
            <Button
              size="sm"
              onClick={() => setDialogState({ mode: 'create' })}
            >
              Thêm tài khoản
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {query.isPending && (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              Đang tải tài khoản ngân hàng…
            </p>
          )}

          {query.isError && (
            <div className="space-y-3">
              <p
                role="alert"
                aria-live="polite"
                className="text-sm text-destructive"
              >
                Không thể tải tài khoản ngân hàng.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => query.refetch()}
              >
                Thử lại
              </Button>
            </div>
          )}

          {query.data && query.data.items.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Khách hàng chưa có tài khoản ngân hàng nào.
              </p>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogState({ mode: 'create' })}
                >
                  Thêm tài khoản
                </Button>
              )}
            </div>
          )}

          {query.data && query.data.items.length > 0 && (
            <ul className="space-y-3">
              {query.data.items.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">
                      {account.accountNumberMasked}
                    </span>
                    <Badge variant={account.isActive ? 'secondary' : 'outline'}>
                      {account.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                    </Badge>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Sửa ${account.accountNumberMasked}`}
                        onClick={() =>
                          setDialogState({ mode: 'edit', account })
                        }
                      >
                        Sửa
                      </Button>
                      {account.isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive pointer-hover:hover:text-destructive"
                          aria-label={`Vô hiệu hóa ${account.accountNumberMasked}`}
                          onClick={() =>
                            setConfirmState({
                              action: 'deactivate',
                              account,
                            })
                          }
                        >
                          Vô hiệu hóa
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Khôi phục ${account.accountNumberMasked}`}
                          onClick={() =>
                            setConfirmState({
                              action: 'reactivate',
                              account,
                            })
                          }
                        >
                          Khôi phục
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CustomerBankAccountDialog
        customerId={customerId}
        open={dialogState !== null}
        account={dialogState?.mode === 'edit' ? dialogState.account : undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDialogState(null);
          }
        }}
      />

      {confirmState && (
        <AlertDialog
          open={confirmState !== null}
          onOpenChange={(open) => {
            if (!open && !isConfirmPending) {
              setConfirmState(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmState.action === 'deactivate'
                  ? 'Vô hiệu hóa tài khoản ngân hàng?'
                  : 'Khôi phục tài khoản ngân hàng?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmState.action === 'deactivate'
                  ? 'Tài khoản này sẽ không còn được dùng để tự động đối soát, nhưng vẫn được giữ trong lịch sử khách hàng.'
                  : 'Tài khoản này sẽ được dùng lại để tự động đối soát sau khi khôi phục.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={isConfirmPending}
                onClick={() => setConfirmState(null)}
              >
                Hủy
              </AlertDialogCancel>
              <AlertDialogAction
                variant={
                  confirmState.action === 'deactivate'
                    ? 'destructive'
                    : 'default'
                }
                disabled={isConfirmPending}
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirm();
                }}
              >
                {isConfirmPending
                  ? 'Đang xử lý…'
                  : confirmState.action === 'deactivate'
                    ? 'Vô hiệu hóa'
                    : 'Khôi phục'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
