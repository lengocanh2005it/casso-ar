export interface OrganizationActivityItem {
  id: string;
  receivableId: string;
  customerId: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export interface OrganizationActivityPage {
  items: OrganizationActivityItem[];
  total: number;
  page: number;
  limit: number;
}
