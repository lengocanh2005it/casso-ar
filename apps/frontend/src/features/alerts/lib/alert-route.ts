const ROUTES: Record<string, string> = {
  bank_connection: '/bank-connections',
  smtp_config: '/settings?tab=smtp',
  reminder_scan: '/reminders',
};

export function alertRoute(entityType: string): string | null {
  return ROUTES[entityType] ?? null;
}
