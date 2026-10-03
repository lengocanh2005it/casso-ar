import { Permission, PlanId } from '@casso-ar/shared-types';
import { Server } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SectionHeading } from '@/components/layout/section-heading';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { hasPlanAccess } from '@/lib/plan-access';
import { hasPermission } from '@/lib/rbac';
import { useDeleteSmtpConfig, useSmtpConfig } from '../api/use-settings';
import type { SmtpConfig } from '../types';
import { SmtpConfigDialog } from './smtp-config-dialog';

function ConfiguredSmtpCard({ config }: { config: SmtpConfig }) {
  const deleteMutation = useDeleteSmtpConfig();
  const isConnected = config.status === 'CONNECTED';

  return (
    <Card
      className={isConnected ? 'border-success/40' : 'border-destructive/40'}
    >
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="break-words font-medium">
            {config.fromAddress} · {config.host}:{config.port}
          </p>
          <Badge variant={isConnected ? 'default' : 'destructive'}>
            {isConnected ? 'Đang hoạt động' : 'Gặp sự cố'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {isConnected
            ? 'Email nhắc nợ đang gửi từ domain của bạn.'
            : 'Không thể kết nối — đang tạm gửi qua Casso. Đã gửi email cảnh báo tới bạn.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <SmtpConfigDialog
            trigger={<Button variant="outline">Sửa cấu hình</Button>}
            existingConfig={config}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Xoá cấu hình</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Xoá cấu hình email server riêng?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Email nhắc nợ sẽ quay về gửi qua casso.vn ngay lập tức. Bạn
                  cần nhập lại toàn bộ thông tin, kể cả mật khẩu, nếu muốn dùng
                  lại.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  Xác nhận xoá cấu hình
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export function SmtpTab() {
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const currentPlan = user?.subscriptionPlan ?? PlanId.FREE;
  const hasPlan = hasPlanAccess(currentPlan, PlanId.BUSINESS);
  const canManage = hasPermission(
    user?.role ?? null,
    Permission.ORGANIZATION_SMTP_MANAGE,
  );
  // GET /api/v1/smtp-config itself requires ORGANIZATION_SMTP_MANAGE (backend
  // gates read + write behind the same OWNER-only permission, unlike
  // billing-tab's unrestricted read) — hide the whole tab, not just the
  // action buttons, so a non-OWNER never triggers a 403. Same pattern as
  // UsersTab's `if (!canView) return null;`.
  const smtpQuery = useSmtpConfig(canManage && hasPlan);

  if (!canManage) return null;

  const heading = (
    <SectionHeading
      icon={Server}
      title="Email riêng"
      description="Gửi email nhắc nợ từ tên miền của tổ chức."
    />
  );

  if (!hasPlan) {
    return (
      <div className="space-y-4">
        {heading}
        <Card className="border-warning/40">
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tính năng dành cho gói Business trở lên.
            </p>
            <Button
              variant="outline"
              onClick={() => setSearchParams({ tab: 'billing' })}
            >
              Nâng cấp gói
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (smtpQuery.isPending) {
    return (
      <div className="space-y-4">
        {heading}
        <p role="status" aria-live="polite">
          Đang tải cấu hình SMTP…
        </p>
      </div>
    );
  }

  if (smtpQuery.isError) {
    return (
      <div className="space-y-4">
        {heading}
        <p role="alert" aria-live="polite" className="text-destructive">
          Không thể tải cấu hình SMTP.
        </p>
      </div>
    );
  }

  if (!smtpQuery.data) {
    return (
      <div className="space-y-4">
        {heading}
        <Card className="border-info/40">
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Chưa cấu hình — email nhắc nợ đang gửi từ casso.vn.
            </p>
            <SmtpConfigDialog
              trigger={<Button>Cấu hình SMTP</Button>}
              existingConfig={null}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {heading}
      <ConfiguredSmtpCard config={smtpQuery.data} />
    </div>
  );
}
