import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { emailTemplatesKey } from '@/lib/use-email-templates';
import type {
  EmailTemplateInput,
  OrganizationMemberList,
  SmtpConfigInput,
} from '../types';
import {
  blockMember,
  changeMemberRole,
  createEmailTemplate,
  deleteEmailTemplate,
  deleteEmailTemplateAttachment,
  deleteSmtpConfig,
  fetchOrganizationInvites,
  fetchOrganizationMembers,
  fetchSmtpConfig,
  getResponseErrorMessage,
  initiatePlanUpgrade,
  inviteOrganizationMember,
  previewEmailTemplate,
  removeMember,
  resendInvite,
  revokeInvite,
  saveSmtpConfig,
  unblockMember,
  updateEmailTemplate,
  uploadEmailTemplateAttachment,
} from './settings-api';

const smtpConfigKey = ['smtp-config'];

export function useSmtpConfig(enabled = true) {
  return useQuery({
    queryKey: smtpConfigKey,
    queryFn: fetchSmtpConfig,
    enabled,
  });
}

export function useSaveSmtpConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SmtpConfigInput) => saveSmtpConfig(input),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình SMTP.');
      void queryClient.invalidateQueries({ queryKey: smtpConfigKey });
    },
  });
}

export function useDeleteSmtpConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSmtpConfig,
    onSuccess: () => {
      toast.success('Đã xoá cấu hình SMTP.');
      void queryClient.invalidateQueries({ queryKey: smtpConfigKey });
    },
    onError: () => toast.error('Không thể xoá cấu hình SMTP.'),
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEmailTemplate,
    onSuccess: () => {
      toast.success('Đã tạo mẫu email.');
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
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
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
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
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
    },
    onError: () => toast.error('Không thể xóa mẫu email.'),
  });
}

export function usePreviewTemplate() {
  return useMutation({ mutationFn: previewEmailTemplate });
}

export function useUploadTemplateAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, file }: { templateId: string; file: File }) =>
      uploadEmailTemplateAttachment(templateId, file),
    onSuccess: () => {
      toast.success('Đã tải lên file đính kèm.');
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
    },
    onError: () => toast.error('Không thể tải lên file đính kèm.'),
  });
}

export function useDeleteTemplateAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      attachmentId,
    }: {
      templateId: string;
      attachmentId: string;
    }) => deleteEmailTemplateAttachment(templateId, attachmentId),
    onSuccess: () => {
      toast.success('Đã xoá file đính kèm.');
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
    },
    onError: () => toast.error('Không thể xoá file đính kèm.'),
  });
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
      void queryClient.invalidateQueries({
        queryKey: ['organization-invites', variables.organizationId],
      });
    },
    onError: () => toast.error('Không thể gửi lời mời.'),
  });
}

export function useChangeMemberRole(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      changeMemberRole(organizationId ?? '', userId, role),
    onSuccess: () => {
      toast.success('Đã đổi vai trò.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(
        getResponseErrorMessage(
          error,
          'Không thể xoá/đổi vai trò OWNER cuối cùng.',
        ),
      ),
  });
}

export function useRemoveMember(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(organizationId ?? '', userId),
    onSuccess: () => {
      toast.success('Đã xoá thành viên.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-members', organizationId],
      });
    },
    onError: (error) =>
      toast.error(
        getResponseErrorMessage(
          error,
          'Không thể xoá/đổi vai trò OWNER cuối cùng.',
        ),
      ),
  });
}

type MemberStatusAction = 'block' | 'unblock';

function useMemberStatusMutation(
  organizationId: string | undefined,
  action: MemberStatusAction,
) {
  const queryClient = useQueryClient();
  const isBlock = action === 'block';
  const queryKey = ['organization-members', organizationId];
  return useMutation({
    mutationFn: (userId: string) =>
      isBlock
        ? blockMember(organizationId ?? '', userId)
        : unblockMember(organizationId ?? '', userId),
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<OrganizationMemberList>(queryKey);
      queryClient.setQueryData<OrganizationMemberList>(queryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((member) =>
                member.userId === userId
                  ? isBlock
                    ? {
                        ...member,
                        status: 'BLOCKED',
                        blockedAt: new Date().toISOString(),
                      }
                    : { ...member, status: 'ACTIVE', blockedAt: null }
                  : member,
              ),
            }
          : current,
      );
      return { previous, queryKey };
    },
    onSuccess: () => {
      toast.success(
        isBlock
          ? 'Đã chặn quyền truy cập của thành viên.'
          : 'Đã bỏ chặn thành viên.',
      );
    },
    onError: (error, _userId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      toast.error(
        getResponseErrorMessage(
          error,
          isBlock
            ? 'Không thể chặn thành viên này. Vui lòng thử lại.'
            : 'Không thể bỏ chặn thành viên này. Vui lòng thử lại.',
        ),
      );
    },
    onSettled: (_data, _error, _userId, context) => {
      void queryClient.invalidateQueries({
        queryKey: context?.queryKey ?? queryKey,
      });
    },
  });
}

export function useBlockMember(organizationId: string | undefined) {
  return useMemberStatusMutation(organizationId, 'block');
}

export function useUnblockMember(organizationId: string | undefined) {
  return useMemberStatusMutation(organizationId, 'unblock');
}

export function useOrganizationInvites(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-invites', organizationId],
    queryFn: () => fetchOrganizationInvites(organizationId ?? ''),
    enabled: Boolean(organizationId),
  });
}

export function useRevokeInvite(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      revokeInvite(organizationId ?? '', inviteId),
    onSuccess: () => {
      toast.success('Đã thu hồi lời mời.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-invites', organizationId],
      });
    },
    onError: () => toast.error('Không thể thu hồi lời mời.'),
  });
}

export function useInitiatePlanUpgrade() {
  return useMutation({
    mutationFn: ({
      targetPlanId,
      returnUrl,
      cancelUrl,
    }: {
      targetPlanId: string;
      returnUrl: string;
      cancelUrl: string;
    }) => initiatePlanUpgrade(targetPlanId, returnUrl, cancelUrl),
    onError: () =>
      toast.error('Không thể tạo đơn thanh toán, vui lòng thử lại.'),
  });
}

export function useResendInvite(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      resendInvite(organizationId ?? '', inviteId),
    onSuccess: () => {
      toast.success('Đã gửi lại lời mời.');
      void queryClient.invalidateQueries({
        queryKey: ['organization-invites', organizationId],
      });
    },
    onError: () => toast.error('Không thể gửi lại lời mời.'),
  });
}
