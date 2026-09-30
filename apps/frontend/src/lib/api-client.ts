import axios, {
  type AxiosRequestConfig,
  type RawAxiosResponseHeaders,
} from 'axios';
import { dispatchGlobalEvent, GLOBAL_EVENTS } from './global-events';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

interface JwtPayload {
  exp?: unknown;
  isOperator?: unknown;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;

  try {
    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    );
    return JSON.parse(atob(paddedPayload)) as JwtPayload;
  } catch {
    return null;
  }
}

function getTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
}

export function isOperatorToken(token: string): boolean {
  return decodeJwtPayload(token)?.isOperator === true;
}

const SESSION_HINT_KEY = 'casso:has-session';
const REFRESH_LOCK_NAME = 'casso:refresh';
// A refresh must be quick, so a request that never gets an answer is treated
// as a transient network failure: it aborts, releases the shared lock so the
// next tab can try, and leaves the session hint alone for the next load to
// retry. Not configurable, and unrelated to the rotation grace window that
// shares its value: that one bounds how long the server honours a replayed
// token, this one bounds how long the client waits for a response.
const REFRESH_TIMEOUT_MS = 10 * 1000;

// Non-sensitive hint only — the real refresh token stays in an httpOnly
// cookie the client can't read. Lets restoreSession() skip the refresh
// call entirely when no login/refresh has ever succeeded on this device.
function setSessionHint(present: boolean): void {
  if (present) {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } else {
    localStorage.removeItem(SESSION_HINT_KEY);
  }
}

export class AuthTokenManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private logoutPromise: Promise<void> | null = null;
  private logoutInitiated = false;
  // ownership generation: bumped on every setAccessToken()/logout, so a
  // refresh started for a stale session can detect it was superseded and
  // must not overwrite the newer token last-write-wins style.
  private generation = 0;
  private pendingRefreshController: AbortController | null = null;

  setAccessToken(token: string | null): void {
    this.generation++;
    this.pendingRefreshController?.abort();
    this.pendingRefreshController = null;
    this.accessToken = token;
    setSessionHint(token !== null);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  hasKnownSession(): boolean {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  }

  async getValidAccessToken(): Promise<string | null> {
    if (this.logoutInitiated) return null;

    const expiresAt = this.accessToken
      ? getTokenExpiry(this.accessToken)
      : null;
    if (expiresAt && expiresAt > Date.now() + 30_000) {
      return this.accessToken;
    }

    if (!this.refreshPromise) {
      const generation = this.generation;
      this.refreshPromise = this.refreshAccessToken(generation)
        .catch((error: unknown) => {
          // Only a rejection from the server ends the session; a network
          // error, 5xx or 429 is transient, so keep the shared hint and let
          // the next load retry.
          const status = getAxiosErrorResponse(error)?.status;
          if (
            generation === this.generation &&
            (status === 401 || status === 403)
          ) {
            this.accessToken = null;
            setSessionHint(false);
          }
          return this.accessToken;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  private async refreshAccessToken(generation: number): Promise<string | null> {
    const controller = new AbortController();
    this.pendingRefreshController = controller;
    const send = () =>
      axiosClient.post<{ accessToken: string }>(
        '/api/v1/auth/refresh',
        {},
        { signal: controller.signal, timeout: REFRESH_TIMEOUT_MS },
      );
    // The refresh cookie rotates on every call, so tabs must refresh one at a
    // time: a later tab then sends the cookie the earlier tab just received.
    const response = await ('locks' in navigator
      ? navigator.locks.request(REFRESH_LOCK_NAME, send)
      : send());
    if (generation !== this.generation) {
      // superseded by a newer login/signup/refresh while this was in flight
      return this.accessToken;
    }
    this.accessToken = response.data.accessToken;
    setSessionHint(true);
    return this.accessToken;
  }

  markLogoutInitiated(): void {
    this.generation++;
    this.pendingRefreshController?.abort();
    this.pendingRefreshController = null;
    this.logoutInitiated = true;
    this.accessToken = null;
    setSessionHint(false);
  }

  resetLogoutState(): void {
    this.logoutInitiated = false;
  }

  async clearStaleRefreshSession(): Promise<void> {
    this.logoutInitiated = true;
    this.accessToken = null;

    if (!this.logoutPromise) {
      this.logoutPromise = axiosClient
        .post('/api/v1/auth/logout')
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          this.logoutPromise = null;
        });
    }

    await this.logoutPromise;
  }
}

export const authTokenManager = new AuthTokenManager();

interface AxiosErrorResponseShape {
  data?: unknown;
  status?: unknown;
}

// Single `unknown` → axios error response narrowing (the `any` ban makes
// direct `error.response` access untyped). Both getErrorCode and the 402
// check in send() use this.
function getAxiosErrorResponse(
  error: unknown,
): AxiosErrorResponseShape | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }
  const response = (error as { response?: unknown }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  const { data, status } = response as { data?: unknown; status?: unknown };
  return { data, status };
}

export function getApiErrorCode(error: unknown): string | undefined {
  const data = getAxiosErrorResponse(error)?.data;
  return typeof data === 'object' && data !== null && 'errorCode' in data
    ? String((data as { errorCode?: unknown }).errorCode)
    : undefined;
}

export function getApiErrorMessage(error: unknown): string | undefined {
  const data = getAxiosErrorResponse(error)?.data;
  return typeof data === 'object' && data !== null && 'message' in data
    ? String((data as { message?: unknown }).message)
    : undefined;
}

export function getApiErrorDetails(
  error: unknown,
): Record<string, unknown> | undefined {
  const data = getAxiosErrorResponse(error)?.data;
  if (typeof data !== 'object' || data === null || !('details' in data)) {
    return undefined;
  }
  const details = (data as { details?: unknown }).details;
  return typeof details === 'object' && details !== null
    ? (details as Record<string, unknown>)
    : undefined;
}

async function send<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; headers: RawAxiosResponseHeaders }> {
  const token = await authTokenManager.getValidAccessToken();
  try {
    const response = await axiosClient.request<T>({
      ...config,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(config.headers ?? {}),
      },
    });
    return {
      data: response.data,
      headers: response.headers,
    };
  } catch (error) {
    const response = getAxiosErrorResponse(error);
    if (response?.status === 402) {
      dispatchGlobalEvent(GLOBAL_EVENTS.PLAN_LIMIT);
    }
    if (getApiErrorCode(error) === 'MEMBER_BLOCKED') {
      dispatchGlobalEvent(GLOBAL_EVENTS.MEMBER_BLOCKED);
    }
    throw error;
  }
}

export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await send<T>(config);
  return data;
}

export async function apiRequestWithHeaders<T>(
  config: AxiosRequestConfig,
): Promise<{ data: T; headers: RawAxiosResponseHeaders }> {
  return send<T>(config);
}

export function postWithIdempotency<T>(
  url: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return apiRequest<T>({
    url,
    method: 'POST',
    data,
    headers: { 'Idempotency-Key': crypto.randomUUID(), ...headers },
  });
}
