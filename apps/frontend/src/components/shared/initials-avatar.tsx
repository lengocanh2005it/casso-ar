import { cn } from '@/lib/utils';

interface InitialsAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'size-9 text-xs',
  md: 'size-14 text-lg',
  lg: 'size-20 text-xl',
};

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function InitialsAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: InitialsAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn(
          'shrink-0 overflow-hidden rounded-full object-cover',
          SIZE_CLASSES[size],
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold leading-none text-primary',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
