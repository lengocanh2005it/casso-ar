import type { Role } from '@casso-ar/shared-types';

export class UserProfileResponseDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  organizationId: string;
  organizationName: string;
  subscriptionPlan: string;
  bankingLinked: boolean;
}

export function toUserProfileResponse(data: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  organizationId: string;
  organizationName: string;
  role: Role;
  subscriptionPlan: string;
  bankingLinked: boolean;
}): UserProfileResponseDto {
  const dto = new UserProfileResponseDto();
  dto.id = data.id;
  dto.email = data.email;
  dto.name = data.name;
  dto.avatarUrl = data.avatarUrl;
  dto.role = data.role;
  dto.organizationId = data.organizationId;
  dto.organizationName = data.organizationName;
  dto.subscriptionPlan = data.subscriptionPlan;
  dto.bankingLinked = data.bankingLinked;
  return dto;
}
