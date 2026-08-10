import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { EmailTemplateInput } from '../types';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  fetchEmailTemplates,
  fetchOrganizationMembers,
  inviteOrganizationMember,
  previewEmailTemplate,
  updateEmailTemplate,
} from './settings-api';

const templatesKey = ['email-templates'];

export function useEmailTemplates() {
  return useQuery({ queryKey: templatesKey, queryFn: fetchEmailTemplates });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEmailTemplate,
    onSuccess: () => {
      toast.success('Đã tạo mẫu email.');
      void queryClient.invalidateQueries({ queryKey: templatesKey });
    },
    onError: () => toast.error('Không thể tạo mẫu email.'),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Pick<EmailTemplateInput, 'subject' | 'bodyHtml'>;
    }) => updateEmailTemplate(id, input),
    onSuccess: () => {
      toast.success('Đã cập nhật mẫu email.');
      void queryClient.invalidateQueries({ queryKey: templatesKey });
    },
    onError: () => toast.error('Không thể cập nhật mẫu email.'),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEmailTemplate,
    onSuccess: () => {
      toast.success('Đã xóa mẫu email.');
      void queryClient.invalidateQueries({ queryKey: templatesKey });
    },
    onError: () => toast.error('Không thể xóa mẫu email.'),
  });
}

export function usePreviewTemplate() {
  return useMutation({ mutationFn: previewEmailTemplate });
}

export function useOrganizationMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: () => fetchOrganizationMembers(organizationId ?? ''),
    enabled: Boolean(organizationId),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      email,
      role,
    }: {
      organizationId: string;
      email: string;
      role: string;
    }) => inviteOrganizationMember(organizationId, { email, role }),
    onSuccess: (_, variables) => {
      toast.success('Đã gửi lời mời.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', variables.organizationId],
      });
    },
    onError: () => toast.error('Không thể gửi lời mời.'),
  });
}
