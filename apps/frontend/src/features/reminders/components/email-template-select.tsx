import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmailTemplates } from '@/lib/use-email-templates';

interface EmailTemplateSelectProps {
  value: string;
  onChange: (templateId: string) => void;
  id?: string;
  ariaLabel?: string;
}

function templateLabel(template: {
  name: string;
  reminderStage: string | null;
}): string {
  return template.reminderStage
    ? `${template.name} — ${template.reminderStage}`
    : template.name;
}

export function EmailTemplateSelect({
  value,
  onChange,
  id,
  ariaLabel,
}: EmailTemplateSelectProps) {
  const { data: templates, isLoading, isError, refetch } = useEmailTemplates();

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
          <SelectValue placeholder="Đang tải template…" />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (isError) {
    return (
      <div className="space-y-1">
        <Select disabled>
          <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
            <SelectValue placeholder="Không tải được danh sách template." />
          </SelectTrigger>
          <SelectContent />
        </Select>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => refetch()}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  const list = templates ?? [];

  if (list.length === 0) {
    return (
      <div className="space-y-1">
        <Select disabled>
          <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
            <SelectValue placeholder="Chưa có email template." />
          </SelectTrigger>
          <SelectContent />
        </Select>
        <Link
          to="/settings?tab=templates"
          className="text-xs text-primary underline"
        >
          Tạo email template trong Cài đặt
        </Link>
      </div>
    );
  }

  const hasOrphanedValue = value !== '' && !list.some((t) => t.id === value);

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder="Chọn email template" />
      </SelectTrigger>
      <SelectContent>
        {hasOrphanedValue && (
          <SelectItem value={value} disabled>
            {`Template không tồn tại (id: ${value})`}
          </SelectItem>
        )}
        {list.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {templateLabel(template)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
