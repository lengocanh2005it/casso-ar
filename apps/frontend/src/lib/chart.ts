// Shared axis styling so every chart reads at the same size in both themes.
export const CHART_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

// A series of zeros/nulls has nothing to plot: callers show an empty state
// instead of bare axes with a meaningless 0–4 scale.
export function hasChartValue(
  values: ReadonlyArray<number | null | undefined>,
): boolean {
  return values.some(
    (value) => value !== null && value !== undefined && value !== 0,
  );
}
