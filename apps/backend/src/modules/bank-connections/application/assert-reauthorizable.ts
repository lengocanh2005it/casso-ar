import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { BankConnection } from '../domain/bank-connection';

// Shared by InitiateConnectionUseCase and ExchangeTokenUseCase: both accept
// an optional existing bankConnectionId meant for re-authorizing a connection
// that lost access, and both must reject it the same way if that connection
// isn't actually waiting on reauthorization.
export function assertReauthorizable(
  bankConnectionId: string | null | undefined,
  existing: BankConnection | null,
): void {
  if (bankConnectionId && existing?.status !== 'REQUIRES_REAUTHORIZATION') {
    throw new AppError(
      ErrorCode.CONFLICT,
      'Kết nối ngân hàng không ở trạng thái cần xác thực lại.',
    );
  }
}
