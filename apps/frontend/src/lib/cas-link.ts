const CAS_LINK_CANCEL_ERROR_CODES = new Set([
  'access_denied',
  'user_cancelled',
  'cancelled',
  'user_denied',
]);

const CAS_LINK_CANCEL_PHRASES = [
  /từ chối/i,
  /hủy/i,
  /thoát/i,
  /cancel/i,
  /denied/i,
  /exit/i,
];

export type CasLinkCallbackResult =
  | { status: 'success'; publicToken: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type CasLinkMessage =
  | { type: 'CAS_LINK_SUCCESS'; publicToken: string }
  | { type: 'CAS_LINK_CANCELLED' }
  | { type: 'CAS_LINK_ERROR'; message: string };

export const CAS_LINK_FAILED_TOAST =
  'Liên kết ngân hàng thất bại. Vui lòng thử lại.';

export function buildCasLinkUrl(
  grantToken: string,
  redirectUri: string,
  linkBaseUrl: string,
): string {
  const params = new URLSearchParams({
    grantToken,
    redirectUri,
    iframe: 'false',
  });
  return `${linkBaseUrl}?${params.toString()}`;
}

export function openCasLinkPopup(
  grantToken: string,
  redirectUri: string,
  linkBaseUrl: string,
): Window | null {
  const url = buildCasLinkUrl(grantToken, redirectUri, linkBaseUrl);
  return window.open(
    url,
    'cas-link',
    'width=480,height=720,scrollbars=yes,resizable=yes',
  );
}

function isCancelledError(
  error: string | null,
  errorMessage: string | null,
): boolean {
  if (error && CAS_LINK_CANCEL_ERROR_CODES.has(error)) {
    return true;
  }

  const text = errorMessage ?? error;
  if (!text) return false;

  return CAS_LINK_CANCEL_PHRASES.some((pattern) => pattern.test(text));
}

export function parseCasLinkCallback(search: string): CasLinkCallbackResult {
  const params = new URLSearchParams(search);
  const publicToken = params.get('publicToken');

  if (publicToken) {
    return { status: 'success', publicToken };
  }

  const error = params.get('error');
  const errorMessage = params.get('errorMessage') ?? params.get('message');

  if (isCancelledError(error, errorMessage)) {
    return { status: 'cancelled' };
  }

  if (errorMessage) {
    return { status: 'error', message: errorMessage };
  }

  if (error) {
    return { status: 'error', message: error };
  }

  return { status: 'cancelled' };
}

export function postCasLinkMessageToOpener(
  result: CasLinkCallbackResult,
): boolean {
  if (!window.opener) return false;

  if (result.status === 'success') {
    window.opener.postMessage(
      {
        type: 'CAS_LINK_SUCCESS',
        publicToken: result.publicToken,
      } satisfies CasLinkMessage,
      window.location.origin,
    );
    return true;
  }

  if (result.status === 'cancelled') {
    window.opener.postMessage(
      { type: 'CAS_LINK_CANCELLED' } satisfies CasLinkMessage,
      window.location.origin,
    );
    return true;
  }

  window.opener.postMessage(
    {
      type: 'CAS_LINK_ERROR',
      message: result.message,
    } satisfies CasLinkMessage,
    window.location.origin,
  );
  return true;
}
