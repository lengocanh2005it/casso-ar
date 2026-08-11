function originOf(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function parseCasRedirectUriAllowlist(
  value: string | undefined,
): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isCasRedirectUriAllowed(
  redirectUri: string,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) return true;
  const redirectOrigin = originOf(redirectUri);
  return (
    redirectOrigin !== null &&
    allowlist.some(
      (allowedOrigin) => originOf(allowedOrigin) === redirectOrigin,
    )
  );
}
