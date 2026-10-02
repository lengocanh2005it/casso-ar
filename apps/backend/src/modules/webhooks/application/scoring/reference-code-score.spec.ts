import { referenceCodeScore } from './reference-code-score';

describe('referenceCodeScore', () => {
  it('scores exact, near, and absent references', () => {
    expect(referenceCodeScore('TT HD INV-2026-0012', 'INV-2026-0012')).toBe(60);
    expect(referenceCodeScore('TT HD INV-2026-012', 'INV-2026-0012')).toBe(30);
    expect(referenceCodeScore('chuyen tien mua hang', 'INV-2026-0012')).toBe(0);
  });

  describe('complete invoice code', () => {
    it.each([
      ['a shorter code inside a longer one', 'TT INV-10', 'INV-1', 30],
      [
        'a shorter code inside a longer one, no separators',
        'INV10',
        'INV-1',
        30,
      ],
      ['a pure-digit code inside a longer number', 'TT 2026110', '2026-11', 30],
      ['a pure-digit code preceded by a digit', 'TT 9202611', '2026-11', 30],
      ['the longer code itself', 'TT INV-10', 'INV-10', 60],
      ['the shorter code on its own', 'TT INV-1', 'INV-1', 60],
      ['a code glued to surrounding text', 'THANHTOANINV10CK', 'INV-10', 60],
      ['a code glued to a letter suffix', 'INV1CK', 'INV-1', 60],
      [
        'a code followed by a non-digit separator',
        'INV-1, thanks',
        'INV-1',
        60,
      ],
      ['a standalone code after a longer one', 'INV-10 va INV-1', 'INV-1', 60],
    ])(
      'treats %s correctly',
      (_name, transferContent, invoiceNumber, score) => {
        expect(referenceCodeScore(transferContent, invoiceNumber)).toBe(score);
      },
    );
  });
});
