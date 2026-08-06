import { referenceCodeScore } from './reference-code-score';

describe('referenceCodeScore', () => {
  it('scores exact, near, and absent references', () => {
    expect(referenceCodeScore('TT HD INV-2026-0012', 'INV-2026-0012')).toBe(60);
    expect(referenceCodeScore('TT HD INV-2026-012', 'INV-2026-0012')).toBe(30);
    expect(referenceCodeScore('chuyen tien mua hang', 'INV-2026-0012')).toBe(0);
  });
});
