import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';

export interface BatchItemResult<T> {
  id: string;
  status: 'success' | 'error';
  data?: T;
  errorCode?: string;
  message?: string;
}

export async function runBatch<TInput, TResult>(
  items: TInput[],
  getId: (item: TInput) => string,
  handle: (item: TInput) => Promise<TResult>,
): Promise<BatchItemResult<TResult>[]> {
  const results: BatchItemResult<TResult>[] = [];
  for (const item of items) {
    const id = getId(item);
    try {
      const data = await handle(item);
      results.push({ id, status: 'success', data });
    } catch (error) {
      if (error instanceof AppError) {
        results.push({
          id,
          status: 'error',
          errorCode: error.errorCode,
          message: error.message,
        });
      } else {
        results.push({
          id,
          status: 'error',
          errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Đã xảy ra lỗi không xác định.',
        });
      }
    }
  }
  return results;
}
