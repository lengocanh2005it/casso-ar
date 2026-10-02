import {
  REFERENCE_KEY_MAX_LENGTH,
  REFERENCE_KEY_MIN_LENGTH,
  referenceKeysFromContent,
} from './reference-keys';

describe('referenceKeysFromContent', () => {
  it('returns nothing when the content is shorter than the minimum key', () => {
    expect(referenceKeysFromContent('')).toEqual([]);
    expect(referenceKeysFromContent('a-1')).toEqual([]);
  });

  it('normalizes case and separators like the invoice number index', () => {
    expect(referenceKeysFromContent('tt inv-2026-0012')).toContain(
      'INV20260012',
    );
  });

  it('includes a code that is glued to the text around it', () => {
    expect(referenceKeysFromContent('THANHTOANINV10CK')).toContain('INV10');
  });

  it('keeps every key within the length bounds', () => {
    const keys = referenceKeysFromContent(`ABCD${'1234567890'.repeat(8)}`);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.length).toBeGreaterThanOrEqual(REFERENCE_KEY_MIN_LENGTH);
      expect(key.length).toBeLessThanOrEqual(REFERENCE_KEY_MAX_LENGTH);
    }
  });

  it('contains the shortest and the longest possible key', () => {
    const keys = referenceKeysFromContent('A'.repeat(40) + 'B'.repeat(40));
    expect(keys).toContain('AAAA');
    expect(keys).toContain('A'.repeat(REFERENCE_KEY_MAX_LENGTH));
    expect(keys).not.toContain('A'.repeat(REFERENCE_KEY_MAX_LENGTH + 1));
  });

  it('lists each key once', () => {
    const keys = referenceKeysFromContent('AAAAAAAAAAAA');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only reads the first 200 normalized characters', () => {
    const keys = referenceKeysFromContent(`${'X'.repeat(200)}INV12345`);
    expect(keys).not.toContain('INV12345');
    expect(keys).not.toContain('INV1');
  });

  it('ignores characters that are not ASCII letters or digits', () => {
    expect(referenceKeysFromContent('TT HĐ INV 1')).toContain('TTHINV1');
  });
});
