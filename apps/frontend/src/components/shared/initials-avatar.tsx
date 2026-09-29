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

// Every avatar used to share the same tint, so a table full of names read
// as one flat block. Hashing the name into a small, already-used semantic
// palette gives each entity a stable, recognizable color without adding a
// new color system.
const TONE_CLASSES = [
  'bg-primary/10 text-primary',
  'bg-success/10 text-success',
  'bg-warning/10 text-warning-strong',
  'bg-info/10 text-info',
];

function toneForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TONE_CLASSES[Math.abs(hash) % TONE_CLASSES.length];
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
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none',
        toneForName(name),
        SIZE_CLASSES[size],
        className,
      )}
    >
      {getInitials(name)}
    </div>
  );
}
