// Origin-only matching for redirect-URI allowlists (CAS ID OAuth + PayOS
// checkout return URLs). Each allowlist entry is compared by origin (scheme
// + host + port), so paths/query params on either side are ignored.
//
// The allowlist FAILS CLOSED: an empty list (unconfigured env var) denies
// every redirect instead of accepting any origin — an open-redirect vector.
function originOf(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function parseRedirectUriAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isRedirectUriAllowed(
  redirectUri: string,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) return false;
  const redirectOrigin = originOf(redirectUri);
  return (
    redirectOrigin !== null &&
    allowlist.some(
      (allowedOrigin) => originOf(allowedOrigin) === redirectOrigin,
    )
  );
}
