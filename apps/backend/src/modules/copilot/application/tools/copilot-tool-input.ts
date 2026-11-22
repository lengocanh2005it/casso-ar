import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';

export const MAX_SEARCH_LIMIT = 10;

export interface SearchAndLimitInput {
  search?: unknown;
  limit?: unknown;
}

/**
 * The one place the search/limit contract for the list-style Copilot tools is
 * enforced, so findOverdueReceivables and rankReceivablesByRisk cannot drift
 * apart on error code or message.
 */
export function validateSearchAndLimit(input: SearchAndLimitInput): {
  search: string | undefined;
  limit: number | undefined;
} {
  const search = input.search;
  if (search !== undefined && typeof search !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Tham số search phải là chuỗi ký tự.',
    );
  }

  const limit = input.limit;
  if (
    limit !== undefined &&
    (typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_SEARCH_LIMIT)
  ) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Tham số limit phải là số nguyên từ 1 đến ${MAX_SEARCH_LIMIT}.`,
    );
  }

  return {
    search: search as string | undefined,
    limit: limit as number | undefined,
  };
}
