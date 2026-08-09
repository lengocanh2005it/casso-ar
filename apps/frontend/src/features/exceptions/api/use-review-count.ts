import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';

interface ReviewCountResponse {
  count: number;
}

export function useReviewCount() {
  return useQuery({
    queryKey: ['exceptions', 'review-count'],
    queryFn: () =>
      apiRequest<ReviewCountResponse>({
        url: '/api/v1/bank-transactions/pending-review-count',
        method: 'GET',
      }),
    select: (data) => data.count,
    refetchInterval: 60_000,
  });
}
