import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  EmailTemplate,
  EmailTemplateAttachment,
} from '@/lib/use-email-templates';
import type {
  EmailTemplateInput,
  EmailTemplatePreview,
  MemberStatusResponse,
  OrganizationInviteList,
  OrganizationMemberList,
  SmtpConfig,
  SmtpConfigInput,
  OwnershipTransfer,
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

export function changeMemberRole(
  organizationId: string,
  userId: string,
  role: string,
): Promise<{ id: string; userId: string; role: string }> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/members/${userId}`,
    method: 'PATCH',
    data: { role },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function removeMember(
  organizationId: string,
  userId: string,
): Promise<void> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/members/${userId}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function fetchOrganizationInvites(
  organizationId: string,
): Promise<OrganizationInviteList> {
  return apiRequest<OrganizationInviteList>({
    url: `/api/v1/organizations/${organizationId}/invites?page=1&limit=100`,
    method: 'GET',
  });
}

export function revokeInvite(
  organizationId: string,
  inviteId: string,
): Promise<void> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/invites/${inviteId}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function resendInvite(
  organizationId: string,
  inviteId: string,
): Promise<{ success: boolean }> {
  return apiRequest({
    url: `/api/v1/organizations/${organizationId}/invites/${inviteId}/resend`,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function blockMember(
  organizationId: string,
  userId: string,
): Promise<MemberStatusResponse> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/members/${userId}/block`,
  );
}

export function initiatePlanUpgrade(
  targetPlanId: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<{ checkoutUrl: string }> {
  return postWithIdempotency('/api/v1/payos/plan-upgrade-orders', {
    targetPlanId,
    returnUrl,
    cancelUrl,
  });
}

export function unblockMember(
  organizationId: string,
  userId: string,
): Promise<MemberStatusResponse> {
  return postWithIdempotency(
    `/api/v1/organizations/${organizationId}/members/${userId}/unblock`,
  );
}

export function uploadEmailTemplateAttachment(
  templateId: string,
  file: File,
): Promise<EmailTemplateAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<EmailTemplateAttachment>({
    url: `/api/v1/email-templates/${templateId}/attachments`,
    method: 'POST',
    data: formData,
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
      'Content-Type': 'multipart/form-data',
    },
  });
}

export function deleteEmailTemplateAttachment(
  templateId: string,
  attachmentId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/email-templates/${templateId}/attachments/${attachmentId}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function requestOwnershipTransfer(
  organizationId: string,
  targetUserId: string,
  currentPassword: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/auth/organizations/${organizationId}/ownership-transfers`,
    { targetUserId, currentPassword },
  );
}

export function confirmOwnershipTransfer(
  organizationId: string,
  requestId: string,
  otp: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/auth/organizations/${organizationId}/ownership-transfers/${requestId}/confirm`,
    { otp },
  );
}

export function cancelOwnershipTransfer(
  organizationId: string,
  requestId: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/auth/organizations/${organizationId}/ownership-transfers/${requestId}/cancel`,
    {},
  );
}

export function acceptOwnershipTransfer(
  organizationId: string,
  requestId: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/auth/organizations/${organizationId}/ownership-transfers/${requestId}/accept`,
    {},
  );
}

export function declineOwnershipTransfer(
  organizationId: string,
  requestId: string,
): Promise<OwnershipTransfer> {
  return postWithIdempotency(
    `/api/v1/auth/organizations/${organizationId}/ownership-transfers/${requestId}/decline`,
    {},
  );
}

export function fetchCurrentOwnershipTransfer(
  organizationId: string,
): Promise<any | null> {
  return apiRequest({
    url: `/api/v1/auth/organizations/${organizationId}/ownership-transfers/current`,
    method: 'GET',
  });
}

export function fetchPendingOwnershipTransferForMe(
  organizationId: string,
): Promise<any | null> {
  return apiRequest({
    url: `/api/v1/auth/organizations/${organizationId}/ownership-transfers/pending-for-me`,
    method: 'GET',
  });
}
