import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api-client';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const emailTemplatesKey = ['email-templates'] as const;

export function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  return apiRequest<EmailTemplate[]>({
    url: '/api/v1/email-templates',
    method: 'GET',
  });
}

export function useEmailTemplates(enabled = true) {
  return useQuery({
    queryKey: emailTemplatesKey,
    queryFn: fetchEmailTemplates,
    enabled,
  });
}
