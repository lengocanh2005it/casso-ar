import { LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { TooltipLabel } from '@/components/shared/tooltip-label';
import { useAuth } from '@/contexts/auth-context';

export function AdminSidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-sidebar-border px-2 py-3">
        <TooltipLabel label="Vận hành viên" side="right">
          <span className="flex w-full items-center justify-center rounded-md p-1.5 text-sidebar-foreground/70">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
        </TooltipLabel>
        <ThemeToggle className="hidden lg:inline-flex" />
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center justify-center rounded-md p-1.5 transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-destructive/5 pointer-hover:hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Đăng xuất"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-sidebar-border px-4 py-3">
      <div className="flex items-center gap-3 text-sm text-sidebar-foreground/70">
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">Vận hành viên</span>
        <ThemeToggle className="ml-auto" />
      </div>
      <button
        type="button"
        onClick={() => void handleLogout()}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-destructive/5 pointer-hover:hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <LogOut className="size-4" />
        Đăng xuất
      </button>
    </div>
  );
}
