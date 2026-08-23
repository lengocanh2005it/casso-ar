import type { MembershipStatus, Role, OwnershipTransferStatus } from '@casso-ledger/shared-types';

export type { MembershipStatus };

export interface EmailTemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
}

export interface EmailTemplatePreview {
  subject: string;
  bodyHtml: string;
}

export type SmtpConfigStatus = 'CONNECTED' | 'FAILED';

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  status: SmtpConfigStatus;
}

export interface SmtpConfigInput {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: string | null;
  status: MembershipStatus;
  blockedAt: string | null;
}

export interface OrganizationMemberList {
  items: OrganizationMember[];
  total: number;
  page: number;
  limit: number;
}

export interface MemberStatusResponse {
  id: string;
  userId: string;
  status: MembershipStatus;
  blockedAt: string | null;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  invitedAt: string;
  expiresAt: string;
}

export interface OrganizationInviteList {
  items: Invite[];
  total: number;
  page: number;
  limit: number;
}

export interface OwnershipTransfer {
  id: string;
  status: OwnershipTransferStatus;
  fromUserId: string;
  toUserId: string;
  acceptanceExpiresAt: string | null;
  createdAt: string;
}
