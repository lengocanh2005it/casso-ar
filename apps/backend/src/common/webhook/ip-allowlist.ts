// Fail-closed source-IP allowlist for inbound webhooks. Cas ID's Balance
// Hook identifies itself by source IP only, no signature header — see
// docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md §3.1.
// Exact match only, no CIDR ranges: Cas ID publishes a small fixed set of
// IPs, not ranges.
export function parseIpAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
}

export function isIpAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(ip);
}
