import { Permission, PlanId } from '@casso-ledger/shared-types';
import { useSearchParams } from 'react-router-dom';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { hasPlanAccess } from '@/lib/plan-access';
import { hasPermission } from '@/lib/rbac';
import { useDeleteSmtpConfig, useSmtpConfig } from '../api/use-settings';
import type { SmtpConfig } from '../types';
import { SmtpConfigDialog } from './smtp-config-dialog';

function ConfiguredSmtpCard({
  config,
  canManage,
}: {
  config: SmtpConfig;
  canManage: boolean;
}) {
  const deleteMutation = useDeleteSmtpConfig();
  const isConnected = config.status === 'CONNECTED';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-4">
          <span>Email server riêng</span>
          <Badge variant={isConnected ? 'default' : 'destructive'}>
            {isConnected ? 'Đang hoạt động' : 'Gặp sự cố'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="font-medium">
          {config.fromAddress} · {config.host}:{config.port}
        </p>
        <p className="text-sm text-muted-foreground">
          {isConnected
            ? 'Email nhắc nợ đang gửi từ domain của bạn.'
            : 'Không thể kết nối — đang tạm gửi qua Casso. Đã gửi email cảnh báo tới bạn.'}
        </p>
        {canManage && (
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
                    cần nhập lại toàn bộ thông tin, kể cả mật khẩu, nếu muốn
                    dùng lại.
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
        )}
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
  const smtpQuery = useSmtpConfig(hasPlan);

  if (!hasPlan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email server riêng</CardTitle>
          <CardDescription>
            Gửi email nhắc nợ từ domain của bạn thay vì casso.vn.
          </CardDescription>
        </CardHeader>
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
    );
  }

  if (smtpQuery.isPending) {
    return <p>Đang tải cấu hình SMTP…</p>;
  }

  if (smtpQuery.isError) {
    return <p className="text-destructive">Không thể tải cấu hình SMTP.</p>;
  }

  if (!smtpQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email server riêng</CardTitle>
          <CardDescription>
            Cấu hình máy chủ gửi email nhắc nợ của tổ chức.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Chưa cấu hình — email nhắc nợ đang gửi từ casso.vn.
          </p>
          {canManage && (
            <SmtpConfigDialog
              trigger={<Button>Cấu hình SMTP</Button>}
              existingConfig={null}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return <ConfiguredSmtpCard config={smtpQuery.data} canManage={canManage} />;
}
