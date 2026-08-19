import { describe, expect, it, vi } from 'vitest';
import {
  buildCasLinkUrl,
  parseCasLinkCallback,
  postCasLinkMessageToOpener,
} from './cas-link';

describe('buildCasLinkUrl', () => {
  it('builds a Cas Link URL with the grant token and redirect URI', () => {
    const url = buildCasLinkUrl(
      'grant-token',
      'http://localhost:5173/bank-connections/cas-id/callback?sessionId=s1',
      'https://link.cas.so',
    );

    expect(url).toBe(
      'https://link.cas.so?grantToken=grant-token&redirectUri=http%3A%2F%2Flocalhost%3A5173%2Fbank-connections%2Fcas-id%2Fcallback%3FsessionId%3Ds1&iframe=false',
    );
  });
});

describe('parseCasLinkCallback', () => {
  it('returns success with the public token', () => {
    expect(parseCasLinkCallback('?sessionId=s1&publicToken=abc')).toEqual({
      status: 'success',
      publicToken: 'abc',
    });
  });

  it('returns cancelled for a known cancellation error code', () => {
    expect(parseCasLinkCallback('?sessionId=s1&error=access_denied')).toEqual({
      status: 'cancelled',
    });
  });

  it('returns cancelled for a Vietnamese cancellation phrase', () => {
    expect(
      parseCasLinkCallback('?sessionId=s1&errorMessage=Người dùng đã từ chối'),
    ).toEqual({ status: 'cancelled' });
  });

  it('returns error with the message for an unrecognized error', () => {
    expect(
      parseCasLinkCallback('?sessionId=s1&errorMessage=Ngân hàng bảo trì'),
    ).toEqual({ status: 'error', message: 'Ngân hàng bảo trì' });
  });

  it('returns cancelled when nothing is present', () => {
    expect(parseCasLinkCallback('?sessionId=s1')).toEqual({
      status: 'cancelled',
    });
  });
});

describe('postCasLinkMessageToOpener', () => {
  it('returns false and posts nothing when there is no opener', () => {
    const originalOpener = window.opener;
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });

    expect(
      postCasLinkMessageToOpener({ status: 'success', publicToken: 'abc' }),
    ).toBe(false);

    Object.defineProperty(window, 'opener', {
      value: originalOpener,
      configurable: true,
    });
  });

  it('posts a CAS_LINK_SUCCESS message to the opener', () => {
    const postMessage = vi.fn();
    const originalOpener = window.opener;
    Object.defineProperty(window, 'opener', {
      value: { postMessage },
      configurable: true,
    });

    expect(
      postCasLinkMessageToOpener({ status: 'success', publicToken: 'abc' }),
    ).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'CAS_LINK_SUCCESS', publicToken: 'abc' },
      window.location.origin,
    );

    Object.defineProperty(window, 'opener', {
      value: originalOpener,
      configurable: true,
    });
  });
});
