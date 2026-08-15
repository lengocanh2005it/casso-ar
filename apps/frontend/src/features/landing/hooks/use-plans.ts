import { useQuery } from '@tanstack/react-query';
import { fetchPlans } from '../api/get-plans';

export function usePlans() {
  return useQuery({
    queryKey: ['landing', 'plans'],
    queryFn: fetchPlans,
  });
}
