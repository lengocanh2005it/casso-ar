export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A rotated refresh token presented again within this long of its rotation is
// a benign race (cancelled reload, several tabs), not theft. See ADR-0030.
export const REFRESH_TOKEN_GRACE_WINDOW_MS = 10 * 1000;
