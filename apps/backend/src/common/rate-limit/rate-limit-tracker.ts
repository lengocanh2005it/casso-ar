type RateLimitScope = 'organizationId' | 'userId';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getScopedRateLimitTracker(
  req: Record<string, unknown>,
  prefix: string,
  scope: readonly RateLimitScope[],
): string {
  const user = isRecord(req.user) ? req.user : null;
  const values = scope.map((field) => user?.[field]);
  if (
    values.every(
      (value): value is string => typeof value === 'string' && value.length > 0,
    )
  ) {
    return `${prefix}:${values.join(':')}`;
  }

  return `${prefix}:ip:${typeof req.ip === 'string' ? req.ip : 'unknown'}`;
}
