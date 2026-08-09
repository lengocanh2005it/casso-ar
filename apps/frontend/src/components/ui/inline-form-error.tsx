import { useEffect, useRef } from 'react';

export function InlineFormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);

  if (!message) return null;

  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="text-sm text-destructive outline-none"
    >
      {message}
    </p>
  );
}
