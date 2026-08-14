import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';
import { runBatch } from './run-batch';

describe('runBatch', () => {
  it('processes items independently and reports one result per item', async () => {
    const results = await runBatch(
      [1, 2, 3],
      (n) => String(n),
      async (n) => {
        if (n === 2) {
          throw new AppError(ErrorCode.VALIDATION_ERROR, 'bad item');
        }
        return n * 10;
      },
    );

    expect(results).toEqual([
      { id: '1', status: 'success', data: 10 },
      {
        id: '2',
        status: 'error',
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'bad item',
      },
      { id: '3', status: 'success', data: 30 },
    ]);
  });

  it('wraps a non-AppError as INTERNAL_SERVER_ERROR without stopping the batch', async () => {
    const results = await runBatch(
      [1, 2],
      (n) => String(n),
      async (n) => {
        if (n === 1) throw new Error('unexpected');
        return n;
      },
    );

    expect(results[0]).toEqual({
      id: '1',
      status: 'error',
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Đã xảy ra lỗi không xác định.',
    });
    expect(results[1]).toEqual({ id: '2', status: 'success', data: 2 });
  });
});
