export function extractIp(req: Record<string, unknown>): string {
  return typeof req.ip === 'string' ? req.ip : 'unknown';
}

export function extractSignupEmail(
  req: Record<string, unknown>,
): string | null {
  const body = req.body as { email?: unknown } | undefined;
  return typeof body?.email === 'string'
    ? body.email.trim().toLowerCase()
    : null;
}

export function extractTaxCode(req: Record<string, unknown>): string | null {
  const body = req.body as { taxCode?: unknown } | undefined;
  if (typeof body?.taxCode === 'string') return body.taxCode.trim();
  const query = req.query as { taxCode?: unknown } | undefined;
  if (typeof query?.taxCode === 'string') return query.taxCode.trim();
  return null;
}
