export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface BankConnection {
  id: string;
  accountNumber: string;
  bankName: string;
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

export interface CasIdInitiation {
  sessionId: string;
  grantToken: string;
  redirectUri: string;
  linkBaseUrl: string;
}

export interface CasIdExchangeInput {
  publicToken: string;
}
