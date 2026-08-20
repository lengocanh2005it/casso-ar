import type { BankConnection } from '../domain/bank-connection';

// Shared by PreviewCassoFlowAccountsUseCase and
// PreviewCassoFlowAuthorizationRotationUseCase — both preview an account
// list against this organization's already-connected accountNumbers.
// Return type intentionally matches CassoFlowAccountPreviewStatus
// (preview-casso-flow-accounts.usecase.ts) structurally, without importing
// it, to avoid a circular import between the two usecase files.
export function classifyCassoFlowAccount(
  accountNumber: string,
  organizationId: string,
  existing: Map<string, BankConnection>,
): 'ALREADY_CONNECTED' | 'TAKEN_BY_ANOTHER_ORG' | 'AVAILABLE' {
  const row = existing.get(accountNumber);
  if (!row) return 'AVAILABLE';
  return row.organizationId === organizationId
    ? 'ALREADY_CONNECTED'
    : 'TAKEN_BY_ANOTHER_ORG';
}
