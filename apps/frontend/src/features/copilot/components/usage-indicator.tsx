import { Gauge } from 'lucide-react';
import { useCopilotUsage } from '../api/copilot-api';

export function UsageIndicator() {
  const { data, isPending, isError } = useCopilotUsage();

  if (isPending || isError || !data) return null;

  return (
    <p
      className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary dark:border-primary/30 dark:bg-primary/10"
      aria-live="polite"
    >
      <Gauge aria-hidden="true" className="size-3.5" />
      Đã dùng {data.turnsUsed}/{data.turnsLimit} lượt Copilot trong tháng này
    </p>
  );
}
