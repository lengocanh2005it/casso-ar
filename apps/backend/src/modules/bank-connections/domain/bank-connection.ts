// REVOKED is listed in the design spec's BankConnection fields but has no
// transition in the state machine — kept for forward-compat; no code path
// produces it yet.
export type BankConnectionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'ACTIVE'
  | 'REQUIRES_REAUTHORIZATION'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface BankConnectionProps {
  id: string;
  organizationId: string;
  accountNumber: string;
  bankName: string;
  encryptedSecureToken: string;
  encryptedCassoApiKey: string;
  status: BankConnectionStatus;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class BankConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly accountNumber: string;
  readonly bankName: string;
  readonly encryptedSecureToken: string;
  readonly encryptedCassoApiKey: string;
  readonly status: BankConnectionStatus;
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
    if (this.status !== 'ACTIVE') {
      throw new Error(
        `Cannot mark connection as requiring reauthorization from status ${this.status}`,
      );
    }
    return new BankConnection({ ...this, status: 'REQUIRES_REAUTHORIZATION' });
  }

  markError(): BankConnection {
    if (this.status !== 'ACTIVE') {
      throw new Error(
        `Cannot mark connection as ERROR from status ${this.status}`,
      );
    }
    return new BankConnection({ ...this, status: 'ERROR' });
  }

  reactivate(input: {
    accountNumber: string;
    bankName: string;
    encryptedSecureToken: string;
    encryptedCassoApiKey: string;
  }): BankConnection {
    if (this.status !== 'REQUIRES_REAUTHORIZATION' && this.status !== 'ERROR') {
      throw new Error(
        `Cannot reactivate a connection in status ${this.status}`,
      );
    }
    return new BankConnection({
      ...this,
      ...input,
      status: 'ACTIVE',
      connectedAt: new Date(),
      revokedAt: null,
    });
  }

  disconnect(): BankConnection {
    if (this.status === 'DISCONNECTED') {
      throw new Error(
        'Cannot disconnect a connection that is already disconnected',
      );
    }
    return new BankConnection({
      ...this,
      status: 'DISCONNECTED',
      revokedAt: new Date(),
    });
  }
}
