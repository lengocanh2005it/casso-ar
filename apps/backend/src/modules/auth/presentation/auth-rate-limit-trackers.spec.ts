import {
  extractIp,
  extractSignupEmail,
  extractTaxCode,
} from './auth-rate-limit-trackers';

describe('extractIp', () => {
  it('returns the request ip', () => {
    expect(extractIp({ ip: '203.0.113.5' })).toBe('203.0.113.5');
  });

  it('falls back to "unknown" when ip is missing', () => {
    expect(extractIp({})).toBe('unknown');
  });
});

describe('extractSignupEmail', () => {
  it('returns the lowercased, trimmed body email', () => {
    expect(extractSignupEmail({ body: { email: ' AP@Congty.VN ' } })).toBe(
      'ap@congty.vn',
    );
  });

  it('returns null when the body has no email', () => {
    expect(extractSignupEmail({ body: {} })).toBeNull();
    expect(extractSignupEmail({})).toBeNull();
  });
});

describe('extractTaxCode', () => {
  it('reads taxCode from the request body (signup)', () => {
    expect(extractTaxCode({ body: { taxCode: ' 0101234567 ' } })).toBe(
      '0101234567',
    );
  });

  it('reads taxCode from the query string (lookup) when body has none', () => {
    expect(extractTaxCode({ body: {}, query: { taxCode: '0101234567' } })).toBe(
      '0101234567',
    );
  });

  it('returns null when neither body nor query has a taxCode', () => {
    expect(extractTaxCode({ body: {}, query: {} })).toBeNull();
  });
});
