import { buildFrontendUrl } from './frontend-url';

describe('buildFrontendUrl', () => {
  const previousCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (previousCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousCorsOrigin;
    }
  });

  it('prefixes the path with CORS_ORIGIN', () => {
    process.env.CORS_ORIGIN = 'https://app.casso.vn';
    expect(buildFrontendUrl('/verify-email?token=abc')).toBe(
      'https://app.casso.vn/verify-email?token=abc',
    );
  });

  it('falls back to the local dev origin when CORS_ORIGIN is unset', () => {
    delete process.env.CORS_ORIGIN;
    expect(buildFrontendUrl('/reset-password?token=abc')).toBe(
      'http://localhost:5173/reset-password?token=abc',
    );
  });
});
