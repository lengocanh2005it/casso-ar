export interface BatchItemResult<T> {
  id: string;
  status: 'success' | 'error';
  data?: T;
  errorCode?: string;
  message?: string;
}

export function summarizeBatchResults<T>(results: BatchItemResult<T>[]): {
  succeeded: string[];
  failed: string[];
} {
  return {
    succeeded: results.filter((r) => r.status === 'success').map((r) => r.id),
    failed: results.filter((r) => r.status === 'error').map((r) => r.id),
  };
}
