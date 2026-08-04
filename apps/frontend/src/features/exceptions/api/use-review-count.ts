import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface ReviewCountResponse {
  count: number;
}

export function useReviewCount() {
  return useQuery({
    queryKey: ['exceptions', 'review-count'],
    queryFn: () =>
      apiClient.get<ReviewCountResponse>(
        '/api/v1/bank-transactions/pending-review-count',
      ),
    select: (data) => data.count,
    refetchInterval: 60_000,
  });
}
