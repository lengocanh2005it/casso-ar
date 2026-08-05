export type CasIdConnectionSessionStatus =
  | 'PENDING_AUTHORIZATION'
  | 'COMPLETED'
  | 'EXPIRED';

export interface CasIdConnectionSessionProps {
  id: string;
  organizationId: string;
  initiatedByUserId: string;
  bankConnectionId: string | null;
  grantToken: string;
  scopes: string[];
  redirectUri: string;
  status: CasIdConnectionSessionStatus;
  expiresAt: Date;
  createdAt: Date;
}

export class CasIdConnectionSession {
  readonly id: string;
  readonly organizationId: string;
  readonly initiatedByUserId: string;
  readonly bankConnectionId: string | null;
  readonly grantToken: string;
  readonly scopes: string[];
  readonly redirectUri: string;
  readonly status: CasIdConnectionSessionStatus;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  constructor(props: CasIdConnectionSessionProps) {
    Object.assign(this, props);
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  markCompleted(): CasIdConnectionSession {
    return new CasIdConnectionSession({ ...this, status: 'COMPLETED' });
  }
}
