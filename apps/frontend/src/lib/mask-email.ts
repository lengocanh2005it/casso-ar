export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at === -1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(4, local.length));
  return `${visible}***${domain}`;
}
