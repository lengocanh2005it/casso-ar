import { useCopilotUsage } from '../api/copilot-api';

export function UsageIndicator() {
  const { data, isPending, isError } = useCopilotUsage();

  if (isPending || isError || !data) return null;

  return (
    <p
      className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
      aria-live="polite"
    >
      Đã dùng {data.turnsUsed}/{data.turnsLimit} lượt Copilot trong tháng này
    </p>
  );
}
