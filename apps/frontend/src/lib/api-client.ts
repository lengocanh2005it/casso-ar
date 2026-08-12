import axios, {
  type AxiosRequestConfig,
  type RawAxiosResponseHeaders,
} from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

interface JwtPayload {
  exp?: unknown;
}

function getTokenExpiry(token: string): number | null {
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
    const payload = JSON.parse(atob(paddedPayload)) as JwtPayload;
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export class AuthTokenManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private logoutPromise: Promise<void> | null = null;
  private logoutInitiated = false;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
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
      this.refreshPromise = this.refreshAccessToken()
        .catch(() => {
          this.accessToken = null;
          return null;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  private async refreshAccessToken(): Promise<string> {
    const response = await axiosClient.post<{ accessToken: string }>(
      '/api/v1/auth/refresh',
      {},
    );
    this.accessToken = response.data.accessToken;
    return this.accessToken;
  }

  markLogoutInitiated(): void {
    this.logoutInitiated = true;
    this.accessToken = null;
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
    const status =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error.response as { status?: unknown }).status
        : undefined;
    if (status === 402) {
      window.dispatchEvent(new CustomEvent('casso:plan-limit'));
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
