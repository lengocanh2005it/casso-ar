export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'DISCONNECTED'
  | 'ERROR';

export interface AccountIdentity {
  accountNumber: string;
  bankName: string;
  [key: string]: unknown;
}

export interface BankConnectionProps {
  id: string;
  organizationId: string;
  casIdConnectionSessionId: string;
  encryptedAccessToken: string;
  accountIdentity: AccountIdentity;
  status: BankConnectionStatus;
  scopes: string[];
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class BankConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly casIdConnectionSessionId: string;
  readonly encryptedAccessToken: string;
  readonly accountIdentity: AccountIdentity;
  readonly status: BankConnectionStatus;
  readonly scopes: string[];
  readonly connectedAt: Date | null;
  readonly lastSyncAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: BankConnectionProps) {
    Object.assign(this, props);
  }

  isUsable(): boolean {
    return this.status === 'ACTIVE';
  }

  markRequiresReauthorization(): BankConnection {
    return new BankConnection({ ...this, status: 'REQUIRES_REAUTHORIZATION' });
  }

  reactivate(input: {
    casIdConnectionSessionId: string;
    encryptedAccessToken: string;
    accountIdentity: AccountIdentity;
    scopes: string[];
  }): BankConnection {
    return new BankConnection({
      ...this,
      ...input,
      status: 'ACTIVE',
      connectedAt: new Date(),
      revokedAt: null,
    });
  }

  disconnect(): BankConnection {
    return new BankConnection({
      ...this,
      status: 'DISCONNECTED',
      revokedAt: new Date(),
    });
  }
}
