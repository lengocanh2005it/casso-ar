const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'always' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const diffSeconds = Math.round(
    (new Date(iso).getTime() - now.getTime()) / 1000,
  );
  const absSeconds = Math.abs(diffSeconds);

  for (const [unit, secondsInUnit] of UNITS) {
    if (absSeconds >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(diffSeconds, 'second');
}
