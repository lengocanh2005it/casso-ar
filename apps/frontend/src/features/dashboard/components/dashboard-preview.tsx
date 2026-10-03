import {
  AlertTriangle,
  Bell,
  CircleDollarSign,
  Clock,
  FileSearch,
  LayoutDashboard,
  Menu,
  Moon,
  PieChart,
  Sun,
  TrendingUp,
} from 'lucide-react';
import { navItems } from '@/components/layout/nav-items';
import { PageHeading } from '@/components/layout/page-heading';
import { SidebarShell } from '@/components/layout/sidebar-shell';
import { Logo } from '@/components/logo';
import { MetricCard } from '@/components/metric-card';
import { TrendMonthsSelect } from '@/components/shared/trend-months-select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PendingReviewBanner } from './pending-review-banner';

export function DashboardPreview() {
  return (
    <div
      aria-hidden="true"
      className="h-[440px] overflow-hidden bg-app-canvas sm:h-[480px]"
      data-testid="dashboard-preview-canvas"
      inert
    >
      <div className="h-full w-full origin-top-left bg-app-canvas md:h-[133.333%] md:w-[133.333%] md:scale-[.75]">
        <div className="flex h-full w-full overflow-hidden bg-app-canvas">
          <div className="hidden h-full shrink-0 md:block">
            <SidebarShell
              items={navItems.map(({ to, label, icon }) => ({
                to,
                label,
                icon,
              }))}
              widthClassName="w-48"
              activePath="/dashboard"
              navLabel="Điều hướng trong bản xem trước"
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
              <span className="rounded-md p-2">
                <Menu aria-hidden="true" className="size-5" />
              </span>
              <Logo
                className="text-base"
                iconClassName="size-6"
                wordmarkClassName="text-base"
              />
              <div className="ml-auto flex items-center gap-1 text-muted-foreground">
                <span className="rounded-md p-2">
                  <Bell aria-hidden="true" className="size-5" />
                </span>
                <span className="rounded-md p-2">
                  <Sun aria-hidden="true" className="size-5 dark:hidden" />
                  <Moon
                    aria-hidden="true"
                    className="hidden size-5 dark:block"
                  />
                </span>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-hidden bg-app-canvas p-4 md:p-6 xl:p-8">
              <div className="mx-auto w-full max-w-[1600px] space-y-5">
                <PageHeading
                  eyebrow="TỔNG QUAN"
                  title="Trang chủ"
                  description="Tổng quan về công nợ và hoạt động thu hồi của bạn."
                  icon={LayoutDashboard}
                  tone="brand"
                  actions={
                    <TrendMonthsSelect value={6} onValueChange={() => {}} />
                  }
                />

                <PendingReviewBanner pendingCount={0} loading />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Tổng công nợ còn lại"
                    description="Tất cả công nợ chưa thanh toán"
                    value=""
                    icon={CircleDollarSign}
                    loading
                  />
                  <MetricCard
                    label="Công nợ quá hạn"
                    description="Công nợ đã vượt ngày đến hạn"
                    value=""
                    icon={AlertTriangle}
                    variant="danger"
                    loading
                  />
                  <MetricCard
                    label="Tỷ lệ quá hạn"
                    description="Tỷ lệ công nợ quá hạn trên tổng"
                    value=""
                    icon={Clock}
                    variant="warning"
                    loading
                  />
                  <MetricCard
                    label="Cần đối soát"
                    description="Giao dịch ngân hàng chờ đối chiếu"
                    value=""
                    icon={FileSearch}
                    variant="success"
                    loading
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-4 text-info" />
                        <CardTitle>Xu hướng công nợ 6 tháng</CardTitle>
                      </div>
                      <CardDescription>
                        Biểu đồ xu hướng tăng giảm công nợ theo thời gian
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-72 w-full" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <PieChart className="size-4 text-warning" />
                        <CardTitle>Tỷ lệ quá hạn</CardTitle>
                      </div>
                      <CardDescription>
                        Phân tích tỷ lệ công nợ đúng hạn và quá hạn
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-72 w-full" />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
