import { PlanId, ReceivableStatus } from '@casso-ar/shared-types';
import {
  ArrowLeftRight,
  BellRing,
  Clock3,
  History,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export const LANDING_NAV_LINKS = [
  { href: '#gioi-thieu', label: 'Giới thiệu' },
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '#bang-gia', label: 'Bảng giá' },
] as const;

export const LANDING_HEADLINE_PHRASES = [
  'không cần nhắc lại',
  'không cần Excel',
  'không cần đoán',
] as const;

export const LANDING_ABOUT = {
  paragraphSegments: [
    { text: 'Casso Ledger', bold: true },
    { text: ' là nền tảng ' },
    { text: 'quản lý và thu hồi công nợ', bold: true },
    {
      text: ' dành cho doanh nghiệp Việt Nam. Giao dịch ngân hàng về tới đâu, hệ thống ',
    },
    { text: 'tự động đối chiếu', bold: true },
    { text: ' với công nợ tới đó — ' },
    { text: 'không cần đợi kế toán nhập tay từng dòng', bold: true },
    { text: '.' },
  ],
  pillars: [
    { label: 'Tự động đối chiếu' },
    { label: 'Nhắc nợ đúng lúc' },
    { label: 'Báo cáo minh bạch' },
  ],
} as const;

export const LANDING_STAT_HIGHLIGHTS = [
  { label: 'Đối chiếu giao dịch ngân hàng theo thời gian thực' },
  { label: 'Không giới hạn số khách hàng theo dõi' },
  { label: 'Nhắc nợ tự động qua email' },
  { label: 'Báo cáo công nợ theo tuổi nợ' },
] as const;

export const LANDING_FEATURES = [
  {
    title: 'Theo dõi công nợ',
    description:
      'Xem toàn bộ khoản phải thu, trạng thái và hạn thanh toán ở một nơi.',
    icon: ListChecks,
  },
  {
    title: 'Đối chiếu thanh toán',
    description:
      'Khớp từng khoản tiền về với đúng công nợ, không cần kiểm tra thủ công.',
    icon: ArrowLeftRight,
  },
  {
    title: 'Nhắc nợ tự động',
    description:
      'Hệ thống tự gửi nhắc nhở đúng thời điểm, không cần bạn nhớ hẹn.',
    icon: BellRing,
  },
  {
    title: 'Báo cáo tuổi nợ',
    description:
      'Biết ngay khoản nào sắp quá hạn, khoản nào đã quá hạn bao lâu.',
    icon: Clock3,
  },
  {
    title: 'Phân quyền theo vai trò',
    description:
      'Mỗi nhân sự chỉ thấy và thao tác đúng phần việc của mình trong công ty.',
    icon: ShieldCheck,
  },
  {
    title: 'Lịch sử xử lý',
    description:
      'Mọi thao tác trên một khoản công nợ đều được ghi lại theo dòng thời gian.',
    icon: History,
  },
] as const;

// Each screen's title mirrors one LANDING_HEADLINE_PHRASES entry, so the
// showcase reads as proof of the hero's rotating claim.
export const LANDING_SHOWCASE_SCREENS = [
  {
    id: 'reminders',
    tabLabel: 'Lịch nhắc',
    title: 'Không cần nhắc lại',
    description:
      'Đặt chính sách một lần, hệ thống tự động gửi email nhắc thanh toán đúng lịch.',
    image: '/showcase-reminders.jpg',
    alt: 'Giao diện Lịch nhắc tự động của Casso Ledger',
    icon: BellRing,
  },
  {
    id: 'dashboard',
    tabLabel: 'Tổng quan',
    title: 'Không cần Excel',
    description:
      'Toàn bộ công nợ, dòng tiền và giao dịch chờ đối soát gói gọn trong một trang tổng quan.',
    image: '/showcase-dashboard.jpg',
    alt: 'Giao diện Dashboard tổng quan công nợ của Casso Ledger',
    icon: LayoutDashboard,
  },
  {
    id: 'copilot',
    tabLabel: 'Copilot',
    title: 'Không cần đoán',
    description:
      'Hỏi Copilot bằng ngôn ngữ tự nhiên, nhận câu trả lời tức thì từ dữ liệu công nợ thật.',
    image: '/showcase-copilot.jpg',
    alt: 'Giao diện Copilot — trợ lý AI thu hồi công nợ của Casso Ledger',
    icon: Sparkles,
  },
] as const;

export const LANDING_STEPS = [
  {
    step: '1',
    title: 'Kết nối ngân hàng',
    description:
      'Liên kết tài khoản ngân hàng của doanh nghiệp trong vài phút.',
  },
  {
    step: '2',
    title: 'Nhận giao dịch tự động',
    description:
      'Mọi giao dịch chuyển khoản đến đều được ghi nhận ngay lập tức.',
  },
  {
    step: '3',
    title: 'Đối chiếu công nợ',
    description: 'Hệ thống tự động khớp giao dịch với công nợ tương ứng.',
  },
] as const;

export const PLAN_LABELS: Record<PlanId, string> = {
  [PlanId.FREE]: 'Free',
  [PlanId.STARTER]: 'Starter',
  [PlanId.BUSINESS]: 'Business',
  [PlanId.ENTERPRISE]: 'Enterprise',
};

export const PLAN_FEATURE_COPY: Record<PlanId, string[]> = {
  [PlanId.FREE]: ['Theo dõi công nợ cơ bản', 'Đối chiếu giao dịch ngân hàng'],
  [PlanId.STARTER]: [
    'Mọi tính năng gói Free',
    'Nhắc nợ tự động qua email',
    'Báo cáo tuổi nợ',
  ],
  [PlanId.BUSINESS]: [
    'Mọi tính năng gói Starter',
    'Phân quyền theo vai trò trong công ty',
    'Gửi email nhắc nợ từ địa chỉ công ty bạn',
  ],
  [PlanId.ENTERPRISE]: [
    'Mọi tính năng gói Business',
    'Không giới hạn số kết nối ngân hàng',
    'Hỗ trợ ưu tiên',
  ],
};

export interface DemoTransaction {
  customer: string;
  amountVnd: number;
  status: ReceivableStatus;
}

export const DEMO_TRANSACTIONS: DemoTransaction[] = [
  {
    customer: 'Công ty TNHH Minh Phát',
    amountVnd: 12_500_000,
    status: ReceivableStatus.OPEN,
  },
  {
    customer: 'Cửa hàng Thanh Tâm',
    amountVnd: 3_200_000,
    status: ReceivableStatus.PARTIALLY_PAID,
  },
  {
    customer: 'Công ty CP Đại Dương',
    amountVnd: 8_900_000,
    status: ReceivableStatus.PAID,
  },
];
