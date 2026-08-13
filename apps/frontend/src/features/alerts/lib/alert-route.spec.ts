import { describe, expect, it } from 'vitest';
import { alertRoute } from './alert-route';

describe('alertRoute', () => {
  it('maps bank_connection to the bank connections settings page', () => {
    expect(alertRoute('bank_connection')).toBe('/bank-connections');
  });

  it('maps smtp_config to the SMTP settings tab', () => {
    expect(alertRoute('smtp_config')).toBe('/settings?tab=smtp');
  });

  it('maps reminder_scan to the reminders page', () => {
    expect(alertRoute('reminder_scan')).toBe('/reminders');
  });

  it('returns null for an unrecognized entityType', () => {
    expect(alertRoute('something_new')).toBeNull();
  });
});
