const SENSITIVE_KEYS = new Set([
  'accessToken',
  'refreshToken',
  'secretKey',
  'password',
  'token',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ponytail: denylist of known-sensitive names; move to per-entity allowlists if
// a new sensitive field is added and the denylist becomes hard to audit.
function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key)) {
    return '[REDACTED]';
  }
  // Date has no own enumerable properties (getTime/toISOString live on the
  // prototype), so isRecord()'s Object.entries() below would silently
  // collapse it to {} — treat it as an opaque scalar instead.
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export function sanitizeAuditPayload(
  value: unknown,
): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null;
  }
  if (Array.isArray(value)) {
    return null;
  }
  const sanitized = sanitizeValue(value);
  return isRecord(sanitized) ? sanitized : null;
}
