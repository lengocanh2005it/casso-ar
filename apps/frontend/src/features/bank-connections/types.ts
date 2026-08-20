export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface BankConnection {
  id: string;
  cassoFlowAuthorizationId: string;
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: BankConnectionStatus;
  connectedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface BankConnectionList {
  items: BankConnection[];
  total: number;
  page: number;
  limit: number;
}

export type CassoFlowAccountPreviewStatus =
  | 'ALREADY_CONNECTED'
  | 'TAKEN_BY_ANOTHER_ORG'
  | 'AVAILABLE';

export interface CassoFlowAccountPreview {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: CassoFlowAccountPreviewStatus;
}

export interface PreviewCassoFlowAccountsResult {
  businessId: string;
  accounts: CassoFlowAccountPreview[];
}

export interface PreviewCassoFlowAuthorizationRotationResult
  extends PreviewCassoFlowAccountsResult {
  missingAccountNumbers: string[];
}

export interface ConfirmCassoFlowInput {
  apiKey: string;
  selectedAccountNumbers: string[];
}

export interface ConnectCassoFlowConnectedItem {
  connectionId: string;
  accountNumber: string;
}

export type ConnectCassoFlowSkippedReason =
  | 'PLAN_LIMIT_EXCEEDED'
  | 'TAKEN_BY_ANOTHER_ORG';

export interface ConnectCassoFlowSkippedItem {
  accountNumber: string;
  reason: ConnectCassoFlowSkippedReason;
}

export interface ConnectCassoFlowResult {
  connected: ConnectCassoFlowConnectedItem[];
  skipped: ConnectCassoFlowSkippedItem[];
}

export interface RotateCassoFlowInput {
  apiKey: string;
}

export interface CassoFlowNewlyDiscoveredAccount {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export interface RotateCassoFlowAuthorizationResult {
  rotatedAccountNumbers: string[];
  newlyDiscovered: CassoFlowNewlyDiscoveredAccount[];
}
