import type { Request } from 'express';
import { extractJwtFromRequest } from './jwt.strategy';

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as Request;
}

describe('extractJwtFromRequest', () => {
  it('extracts from the Authorization Bearer header when present', () => {
    const request = fakeRequest({
      headers: { authorization: 'Bearer header-token' },
    });

    expect(extractJwtFromRequest(request)).toBe('header-token');
  });

  it('falls back to the ?token= query param when there is no Bearer header (native EventSource cannot set headers)', () => {
    const request = fakeRequest({ query: { token: 'query-token' } });

    expect(extractJwtFromRequest(request)).toBe('query-token');
  });

  it('prefers the Bearer header over the query param when both are present', () => {
    const request = fakeRequest({
      headers: { authorization: 'Bearer header-token' },
      query: { token: 'query-token' },
    });

    expect(extractJwtFromRequest(request)).toBe('header-token');
  });

  it('returns null when neither is present', () => {
    expect(extractJwtFromRequest(fakeRequest())).toBeNull();
  });

  it('returns null when the query token is not a string (e.g. ?token[]=a&token[]=b)', () => {
    const request = fakeRequest({ query: { token: ['a', 'b'] as never } });

    expect(extractJwtFromRequest(request)).toBeNull();
  });
});
