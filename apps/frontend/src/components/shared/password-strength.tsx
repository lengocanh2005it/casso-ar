import { cn } from '@/lib/utils';

function getStrength(password: string): {
  label: string;
  color: string;
  width: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { label: 'Yếu', color: 'bg-red-500', width: 'w-1/3' };
  if (score <= 3)
    return { label: 'Trung bình', color: 'bg-amber-500', width: 'w-2/3' };
  return { label: 'Mạnh', color: 'bg-emerald-500', width: 'w-full' };
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { label, color, width } = getStrength(password);
  return (
    <div className="space-y-1">
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', color, width)}
        />
      </div>
      <p className="text-xs text-muted-foreground">Độ mạnh: {label}</p>
    </div>
  );
}
