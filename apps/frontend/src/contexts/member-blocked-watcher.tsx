import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { GLOBAL_EVENTS, useGlobalEvent } from '@/lib/global-events';

export function MemberBlockedWatcher() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useGlobalEvent(GLOBAL_EVENTS.MEMBER_BLOCKED, () => {
    void logout()
      .then(() => {
        toast.error('Tài khoản của bạn đã bị chặn khỏi tổ chức này.');
        navigate('/login');
      })
      .catch(() => navigate('/login'));
  });

  return null;
}
