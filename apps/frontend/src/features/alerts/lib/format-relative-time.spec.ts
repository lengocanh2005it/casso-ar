import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format-relative-time';

describe('formatRelativeTime', () => {
  it('formats a few minutes ago in Vietnamese', () => {
    const now = new Date('2026-08-13T10:30:00Z');
    const createdAt = new Date('2026-08-13T10:25:00Z').toISOString();

    expect(formatRelativeTime(createdAt, now)).toBe('5 phút trước');
  });

  it('formats a few hours ago in Vietnamese', () => {
    const now = new Date('2026-08-13T12:00:00Z');
    const createdAt = new Date('2026-08-13T10:00:00Z').toISOString();

    expect(formatRelativeTime(createdAt, now)).toBe('2 giờ trước');
  });
});
