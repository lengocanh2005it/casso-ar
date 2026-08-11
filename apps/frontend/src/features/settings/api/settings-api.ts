import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplatePreview,
  OrganizationMemberList,
  SmtpConfig,
  SmtpConfigInput,
} from '../types';

/** HTTP status of a failed apiRequest call, or undefined for a non-HTTP error. */
function getResponseStatus(error: unknown): number | undefined {
  const response =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { status?: unknown } }).response
      : undefined;
  const status = response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** The backend's `{ message }` error body, or a caller-supplied fallback. */
export function getResponseErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const response =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as { response?: { data?: unknown } }).response
      : undefined;
  const data = response?.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
  ) {
    return data.message;
  }
  return fallback;
}

export async function fetchSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    return await apiRequest<SmtpConfig>({
      url: '/api/v1/smtp-config',
      method: 'GET',
    });
  } catch (error) {
    if (getResponseStatus(error) === 404) return null;
    throw error;
  }
}

export function saveSmtpConfig(input: SmtpConfigInput): Promise<SmtpConfig> {
  return postWithIdempotency<SmtpConfig>('/api/v1/smtp-config', input);
}

export function deleteSmtpConfig(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: '/api/v1/smtp-config',
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  return apiRequest<EmailTemplate[]>({
    url: '/api/v1/email-templates',
    method: 'GET',
  });
}

export function createEmailTemplate(
  input: EmailTemplateInput,
): Promise<EmailTemplate> {
  return postWithIdempotency<EmailTemplate>('/api/v1/email-templates', input);
}

export function updateEmailTemplate(
  id: string,
  input: Pick<EmailTemplateInput, 'subject' | 'bodyHtml'>,
): Promise<EmailTemplate> {
  return apiRequest<EmailTemplate>({
    url: `/api/v1/email-templates/${id}`,
    method: 'PATCH',
    data: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function deleteEmailTemplate(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/email-templates/${id}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function previewEmailTemplate(
  id: string,
): Promise<EmailTemplatePreview> {
  return apiRequest<EmailTemplatePreview>({
    url: `/api/v1/email-templates/${id}/preview`,
    method: 'POST',
    data: { sampleData: {} },
  });
}

export function fetchOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMemberList> {
  return apiRequest<OrganizationMemberList>({
    url: `/api/v1/organizations/${organizationId}/members?page=1&limit=100`,
    method: 'GET',
  });
}

export function inviteOrganizationMember(
  organizationId: string,
  input: { email: string; role: string },
): Promise<{ success: boolean }> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/invites`,
    input,
  );
}
