// Mirrors the real getApiErrorCode/getApiErrorMessage from '@/lib/api-client'
// for tests that mock the whole module — shared so specs stay in sync with
// each other instead of copy-pasting the same axios-shaped extraction logic.
export function getApiErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { errorCode?: string } } })?.response
    ?.data?.errorCode;
}

export function getApiErrorMessage(error: unknown): string | undefined {
  return (error as { response?: { data?: { message?: string } } })?.response
    ?.data?.message;
}
