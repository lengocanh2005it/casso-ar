import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

export function MemberBlockedWatcher() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    function handleBlocked() {
      void logout()
        .then(() => {
          toast.error('Tài khoản của bạn đã bị chặn khỏi tổ chức này.');
          navigate('/login');
        })
        .catch(() => navigate('/login'));
    }
    window.addEventListener('casso:member-blocked', handleBlocked);
    return () =>
      window.removeEventListener('casso:member-blocked', handleBlocked);
  }, [logout, navigate]);

  return null;
}
