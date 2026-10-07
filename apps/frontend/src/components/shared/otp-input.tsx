import { useRef } from 'react';
import { Input } from '@/components/ui/input';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
}

export function OtpInput({ length = 6, value, onChange }: OtpInputProps) {
  // `size-11`, not `size-10`: a 40px field is under the 44px tap-target
  // floor the auth viewport suite asserts. `size-11` also keeps six fields
  // plus five gaps inside the narrowest auth card.
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, digit: string) {
    if (!/^\d?$/.test(digit)) return;
    const newValue = value.split('');
    newValue[index] = digit;
    onChange(newValue.join(''));
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length }, (_, i) => (
        <Input
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP input, never reorders
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          aria-label={`Chữ số ${i + 1} trong mã OTP`}
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="size-11 text-center text-lg"
        />
      ))}
    </div>
  );
}
