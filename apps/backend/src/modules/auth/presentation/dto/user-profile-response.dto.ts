export class UserProfileResponseDto {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  subscriptionPlan: string;
}

export function toUserProfileResponse(data: {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  subscriptionPlan: string;
}): UserProfileResponseDto {
  const dto = new UserProfileResponseDto();
  dto.id = data.id;
  dto.email = data.email;
  dto.name = data.name;
  dto.organizationId = data.organizationId;
  dto.subscriptionPlan = data.subscriptionPlan;
  return dto;
}
