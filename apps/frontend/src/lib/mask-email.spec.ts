import { describe, expect, it } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first 4 characters of the local part and masks the rest', () => {
    expect(maskEmail('lengocanh@gmail.com')).toBe('leng***@gmail.com');
  });

  it('masks a short local part entirely rather than going negative', () => {
    expect(maskEmail('ab@x.vn')).toBe('ab***@x.vn');
  });

  it('returns the input unchanged when it has no @', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
