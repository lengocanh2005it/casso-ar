export enum DisputeStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

export interface DisputeProps {
  id: string;
  organizationId: string;
  receivableId: string;
  reason: string;
  status: DisputeStatus;
  openedByUserId: string;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  version: number;
}

export class Dispute {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly reason: string;
  readonly status: DisputeStatus;
  readonly openedByUserId: string;
  readonly resolvedByUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
  readonly version: number;

  constructor(props: DisputeProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.receivableId = props.receivableId;
    this.reason = props.reason;
    this.status = props.status;
    this.openedByUserId = props.openedByUserId;
    this.resolvedByUserId = props.resolvedByUserId;
    this.resolvedAt = props.resolvedAt;
    this.createdAt = props.createdAt;
    this.version = props.version;
  }

  resolve(resolvedByUserId: string): Dispute {
    if (this.status !== DisputeStatus.OPEN) {
      throw new Error('Cannot resolve a dispute that is not OPEN');
    }

    return new Dispute({
      ...this,
      status: DisputeStatus.RESOLVED,
      resolvedByUserId,
      resolvedAt: new Date(),
    });
  }
}
