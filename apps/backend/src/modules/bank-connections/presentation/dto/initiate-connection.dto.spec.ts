import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitiateConnectionDto } from './initiate-connection.dto';

describe('InitiateConnectionDto', () => {
  const previousAllowlist = process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;

  afterEach(() => {
    if (previousAllowlist === undefined) {
      delete process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;
    } else {
      process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = previousAllowlist;
    }
  });

  it('rejects a redirect URI outside the configured allowlist', async () => {
    process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = 'https://app.casso.vn';

    const errors = await validate(
      plainToInstance(InitiateConnectionDto, {
        redirectUri: 'https://evil.example/callback',
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'redirectUri',
          constraints: expect.objectContaining({
            isAllowedCasRedirectUri: expect.any(String),
          }),
        }),
      ]),
    );
  });

  it('accepts a redirect URI on a configured origin', async () => {
    process.env.CAS_ID_REDIRECT_URI_ALLOWLIST = 'https://app.casso.vn';

    const errors = await validate(
      plainToInstance(InitiateConnectionDto, {
        redirectUri: 'https://app.casso.vn/cas/callback',
      }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects every redirect URI when the allowlist is empty (fail closed)', async () => {
    delete process.env.CAS_ID_REDIRECT_URI_ALLOWLIST;

    const errors = await validate(
      plainToInstance(InitiateConnectionDto, {
        redirectUri: 'http://localhost/callback',
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'redirectUri',
          constraints: expect.objectContaining({
            isAllowedCasRedirectUri: expect.any(String),
          }),
        }),
      ]),
    );
  });
});
