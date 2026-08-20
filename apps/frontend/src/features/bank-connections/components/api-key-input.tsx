import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ApiKeyInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor="casso-api-key">Casso Flow API Key</Label>
      <div className="relative">
        <Input
          id="casso-api-key"
          type={showApiKey ? 'text' : 'password'}
          placeholder="AK_CS.****"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete="off"
          required
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setShowApiKey((current) => !current)}
          aria-label={showApiKey ? 'Ẩn mã API Key' : 'Hiện mã API Key'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground pointer-hover:hover:text-foreground"
        >
          {showApiKey ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Bạn có thể xem cách lấy API Key tại{' '}
        <a
          href="https://developer.casso.vn/v1/auth-code/tao-authorization-code-thu-cong"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-medium pointer-hover:hover:underline"
        >
          đây
        </a>
        .
      </p>
    </div>
  );
}
