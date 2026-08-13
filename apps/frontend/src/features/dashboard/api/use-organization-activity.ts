import { useQuery } from '@tanstack/react-query';
import { fetchOrganizationActivity } from './dashboard-api';

export function useOrganizationActivity() {
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => fetchOrganizationActivity(1),
  });
}
