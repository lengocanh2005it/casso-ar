// Shared axis styling so every chart reads at the same size in both themes.
export const CHART_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 };

// Recharts' default tooltip hardcodes #fff/#000, which renders near-white text
// on a white box in dark mode. Spread this on every <Tooltip /> so the popup
// follows the theme instead.
export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
  },
  itemStyle: {
    color: 'var(--popover-foreground)',
  },
  labelStyle: {
    color: 'var(--muted-foreground)',
  },
} as const;

// A black shadow vanishes on the dark canvas, so a sticky column loses its
// edge. Layer a token-coloured shadow that reads in both themes.
export const STICKY_EDGE = 'shadow-[-8px_0_8px_-8px_var(--foreground)]';

// A series of zeros/nulls has nothing to plot: callers show an empty state
// instead of bare axes with a meaningless 0–4 scale.
export function hasChartValue(
  values: ReadonlyArray<number | string | null | undefined>,
): boolean {
  return values.some((value) =>
    typeof value === 'string'
      ? BigInt(value) !== 0n
      : value !== null && value !== undefined && value !== 0,
  );
}

// Only the bounded ratio enters a chart; source VND strings stay in its payload.
export function moneyPercent(value: string, maximum: bigint): number {
  if (maximum <= 0n) return 0;
  const scaled = (BigInt(value) * 10_000n) / maximum;
  const bounded = scaled < 0n ? 0n : scaled > 10_000n ? 10_000n : scaled;
  return Number(bounded) / 100;
}

export function maxMoney(values: ReadonlyArray<string | null>): bigint {
  return values.reduce<bigint>((max, value) => {
    const amount = value === null ? 0n : BigInt(value);
    return amount > max ? amount : max;
  }, 0n);
}
