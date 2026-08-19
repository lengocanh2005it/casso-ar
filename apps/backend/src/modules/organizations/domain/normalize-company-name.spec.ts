import {
  matchesTaxCodeName,
  normalizeCompanyName,
} from './normalize-company-name';

describe('normalizeCompanyName', () => {
  it('strips diacritics, uppercases, drops punctuation, and collapses whitespace', () => {
    expect(normalizeCompanyName('Công Ty TNHH  Casso Việt Nam.')).toBe(
      'CONG TY TNHH CASSO VIET NAM',
    );
  });
});

describe('matchesTaxCodeName', () => {
  it('matches when normalized forms are identical', () => {
    expect(
      matchesTaxCodeName(
        'Công ty TNHH Casso Việt Nam',
        'CÔNG TY TNHH CASSO VIỆT NAM',
      ),
    ).toBe(true);
  });

  it('does not match on any difference after normalization', () => {
    expect(
      matchesTaxCodeName('Công ty TNHH Casso', 'Công ty Cổ phần Casso'),
    ).toBe(false);
  });
});
