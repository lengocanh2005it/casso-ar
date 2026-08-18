import type { PlanId, Role } from '@casso-ledger/shared-types';
import { Building2, CreditCard, LogOut, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getPlanLabel(plan: PlanId): string {
  const labels: Record<string, string> = {
    FREE: 'Free',
    STARTER: 'Starter',
    GROWTH: 'Growth',
    ENTERPRISE: 'Enterprise',
  };
  return labels[plan] ?? plan;
}

function getRoleLabel(role: Role): string {
  const labels: Record<string, string> = {
    OWNER: 'Chủ sở hữu',
    ADMIN: 'Quản trị viên',
    MEMBER: 'Thành viên',
  };
  return labels[role] ?? role;
}

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    onOpenChange(false);
    await logout();
    toast.success('Đã đăng xuất.');
    navigate('/login');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thông tin tài khoản</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Tổ chức:</span>
            <span className="truncate font-medium">
              {user.organizationName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Shield className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Vai trò:</span>
            <span className="font-medium">{getRoleLabel(user.role)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CreditCard className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Gói:</span>
            <span className="font-medium">
              {getPlanLabel(user.subscriptionPlan)}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => void handleLogout()}
        >
          <LogOut className="size-4" />
          Đăng xuất
        </Button>
      </DialogContent>
    </Dialog>
  );
}
