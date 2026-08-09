import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getPlanLabel(plan: string): string {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Đã đăng xuất.');
    navigate('/login');
  }

  if (!user) return null;

  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        {getInitials(user.name)}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.organizationName} · {getPlanLabel(user.subscriptionPlan)}
          </p>
        </div>
      )}
      <button
        type="button"
        aria-label="Đăng xuất"
        onClick={() => void handleLogout()}
        className="rounded-md p-1.5 hover:bg-sidebar-accent"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
