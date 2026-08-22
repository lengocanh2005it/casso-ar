import { Gauge } from 'lucide-react';
import { useCopilotUsage } from '../api/copilot-api';

export function UsageIndicator() {
  const { data, isPending, isError } = useCopilotUsage();

  if (isPending || isError || !data) return null;

  return (
    <p
      className="flex items-center gap-2 rounded-xl border border-violet-200/70 bg-violet-50/70 px-3 py-2 text-xs text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300"
      aria-live="polite"
    >
      <Gauge aria-hidden="true" className="size-3.5" />
      Đã dùng {data.turnsUsed}/{data.turnsLimit} lượt Copilot trong tháng này
    </p>
  );
}
