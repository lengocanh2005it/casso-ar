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

  it('does not accept a ?token= query param — the SSE client sends the Bearer header (fetch-based stream), so the query fallback must stay dead (CWE-598)', () => {
    const request = fakeRequest({ query: { token: 'query-token' } });

    expect(extractJwtFromRequest(request)).toBeNull();
  });

  it('ignores a query token even when the Bearer header is present', () => {
    const request = fakeRequest({
      headers: { authorization: 'Bearer header-token' },
      query: { token: 'query-token' },
    });

    expect(extractJwtFromRequest(request)).toBe('header-token');
  });

  it('returns null when neither is present', () => {
    expect(extractJwtFromRequest(fakeRequest())).toBeNull();
  });
});
