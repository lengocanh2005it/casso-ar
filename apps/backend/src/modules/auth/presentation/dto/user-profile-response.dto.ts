export class UserProfileResponseDto {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organizationName: string;
  subscriptionPlan: string;
}

export function toUserProfileResponse(data: {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: string;
  subscriptionPlan: string;
}): UserProfileResponseDto {
  const dto = new UserProfileResponseDto();
  dto.id = data.id;
  dto.email = data.email;
  dto.name = data.name;
  dto.role = data.role;
  dto.organizationId = data.organizationId;
  dto.organizationName = data.organizationName;
  dto.subscriptionPlan = data.subscriptionPlan;
  return dto;
}
