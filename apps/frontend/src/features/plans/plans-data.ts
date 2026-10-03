import { PlanId } from '@casso-ar/shared-types';

export const PLAN_LABELS: Record<PlanId, string> = {
  [PlanId.FREE]: 'Miễn phí',
  [PlanId.STARTER]: 'Khởi đầu',
  [PlanId.BUSINESS]: 'Chuyên nghiệp',
  [PlanId.ENTERPRISE]: 'Doanh nghiệp',
};

export const PLAN_FEATURE_COPY: Record<PlanId, string[]> = {
  [PlanId.FREE]: ['Theo dõi công nợ cơ bản', 'Đối chiếu giao dịch ngân hàng'],
  [PlanId.STARTER]: [
    'Mọi tính năng của gói Miễn phí',
    'Nhắc nợ tự động qua email',
    'Báo cáo tuổi nợ',
  ],
  [PlanId.BUSINESS]: [
    'Mọi tính năng của gói Khởi đầu',
    'Phân quyền theo vai trò trong công ty',
    'Gửi email nhắc nợ từ địa chỉ công ty bạn',
  ],
  [PlanId.ENTERPRISE]: [
    'Mọi tính năng của gói Chuyên nghiệp',
    'Hỗ trợ ưu tiên',
  ],
};
