import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { dispatchGlobalEvent, GLOBAL_EVENTS } from '@/lib/global-events';
import type {
  CassoFlowAccountPreview,
  ConnectCassoFlowResult,
  PreviewCassoFlowAccountsResult,
  PreviewCassoFlowAuthorizationRotationResult,
  RotateCassoFlowAuthorizationResult,
} from '../types';
import { ApiKeyInput } from './api-key-input';

type PreviewResult =
  | PreviewCassoFlowAccountsResult
  | PreviewCassoFlowAuthorizationRotationResult;
type ConfirmResult =
  | ConnectCassoFlowResult
  | RotateCassoFlowAuthorizationResult;

function hasSkippedAccounts(
  result: ConfirmResult,
): result is ConnectCassoFlowResult {
  return 'skipped' in result;
}

function isSelectable(account: CassoFlowAccountPreview): boolean {
  return account.status === 'AVAILABLE';
}

function statusMessage(account: CassoFlowAccountPreview): string {
  if (account.status === 'ALREADY_CONNECTED') return 'Đã kết nối';
  if (account.status === 'TAKEN_BY_ANOTHER_ORG') {
    return 'Đã được tổ chức khác kết nối';
  }
  return 'Có thể kết nối';
}

function skippedReason(reason: string): string {
  return reason === 'PLAN_LIMIT_EXCEEDED'
    ? 'vượt hạn mức gói dịch vụ'
    : 'đã được tổ chức khác kết nối';
}

export function CassoFlowAccountPicker({
  onPreview,
  onConfirm,
  onCompleted,
}: {
  onPreview: (apiKey: string) => Promise<PreviewResult>;
  onConfirm: (
    apiKey: string,
    selectedAccountNumbers: string[],
  ) => Promise<ConfirmResult>;
  onCompleted?: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [accounts, setAccounts] = useState<CassoFlowAccountPreview[] | null>(
    null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [missingAccountNumbers, setMissingAccountNumbers] = useState<string[]>(
    [],
  );
  const [skipped, setSkipped] = useState<ConnectCassoFlowResult['skipped']>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handlePreview(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setError(null);
    setIsPending(true);
    try {
      const result = await onPreview(trimmed);
      setAccounts(result.accounts);
      setMissingAccountNumbers(
        'missingAccountNumbers' in result ? result.missingAccountNumbers : [],
      );
      setSelected(
        result.accounts
          .filter(
            (account) =>
              account.status === 'AVAILABLE' ||
              account.status === 'ALREADY_CONNECTED',
          )
          .map((account) => account.accountNumber),
      );
    } catch {
      setError('Không thể kiểm tra tài khoản. Vui lòng kiểm tra lại API Key.');
    } finally {
      setIsPending(false);
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    if (!accounts || selected.length === 0) return;

    setError(null);
    setSkipped([]);
    setIsPending(true);
    try {
      const result = await onConfirm(apiKey.trim(), selected);
      if (hasSkippedAccounts(result) && result.skipped.length > 0) {
        setSkipped(result.skipped);
        if (
          result.skipped.some((item) => item.reason === 'PLAN_LIMIT_EXCEEDED')
        ) {
          dispatchGlobalEvent(GLOBAL_EVENTS.PLAN_LIMIT);
        }
        return;
      }
      onCompleted?.();
    } catch {
      setError('Không thể kết nối Casso Flow. Vui lòng thử lại.');
    } finally {
      setIsPending(false);
    }
  }

  function handleEditApiKey() {
    setAccounts(null);
    setSelected([]);
    setMissingAccountNumbers([]);
    setSkipped([]);
    setError(null);
  }

  if (!accounts) {
    return (
      <form onSubmit={handlePreview} className="space-y-4 pt-2">
        <ApiKeyInput value={apiKey} onChange={setApiKey} disabled={isPending} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
            disabled={!apiKey.trim() || isPending}
          >
            {isPending ? 'Đang kiểm tra…' : 'Xem tài khoản'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleConfirm} className="space-y-4 pt-2">
      {missingAccountNumbers.length > 0 && (
        <p role="status" className="break-words text-sm text-destructive">
          {missingAccountNumbers.join(', ')} không tìm thấy trong API Key mới,
          sẽ giữ nguyên trạng thái hiện tại.
        </p>
      )}
      {accounts.length === 0 ? (
        <p
          role="status"
          className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          Không tìm thấy tài khoản ngân hàng từ API Key này. Hãy kiểm tra lại
          quyền truy cập hoặc nhập API Key khác.
        </p>
      ) : (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Chọn tài khoản ngân hàng
          </legend>
          <ScrollArea className="max-h-64">
            <div className="space-y-3 pr-3">
              {accounts.map((account) => {
                const selectable = isSelectable(account);
                return (
                  <label
                    key={account.accountNumber}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    <input
                      type="checkbox"
                      aria-label={account.accountNumber}
                      checked={selected.includes(account.accountNumber)}
                      disabled={!selectable || isPending}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, account.accountNumber]
                            : current.filter(
                                (number) => number !== account.accountNumber,
                              ),
                        )
                      }
                      className="mt-1 size-4"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block break-words font-medium">
                        {account.bankName}
                      </span>
                      <span
                        className="block min-w-0 truncate"
                        title={account.accountNumber}
                      >
                        {account.accountNumber}
                      </span>
                      <span className="block break-words text-muted-foreground">
                        {account.accountHolderName} · {statusMessage(account)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </fieldset>
      )}

      {skipped.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 p-3"
        >
          <p className="text-sm font-medium">
            Một số tài khoản chưa được kết nối
          </p>
          <ul className="mt-1 list-disc break-words pl-5 text-sm text-muted-foreground">
            {skipped.map((item) => (
              <li key={item.accountNumber}>
                {item.accountNumber}: {skippedReason(item.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isPending}
          onClick={handleEditApiKey}
        >
          Sửa API Key
        </Button>
        {accounts.length > 0 && (
          <Button
            type="submit"
            className="w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:w-auto"
            disabled={selected.length === 0 || isPending}
          >
            {isPending ? 'Đang kết nối…' : 'Xác nhận'}
          </Button>
        )}
      </div>
    </form>
  );
}
