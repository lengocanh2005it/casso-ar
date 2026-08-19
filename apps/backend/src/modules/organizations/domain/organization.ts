export type OrganizationStatus =
  | 'ACTIVE'
  | 'LOCKED'
  | 'PENDING_REVIEW'
  | 'REJECTED';

export interface OrganizationProps {
  id: string;
  name: string;
  status?: OrganizationStatus;
  taxCode?: string;
  taxCodeMatched?: boolean;
  taxCodeLookupName?: string | null;
  createdAt: Date;
}

export class Organization {
  readonly id: string;
  readonly name: string;
  readonly status: OrganizationStatus;
  readonly taxCode: string;
  readonly taxCodeMatched: boolean;
  readonly taxCodeLookupName: string | null;
  readonly createdAt: Date;

  constructor(props: OrganizationProps) {
    this.id = props.id;
    this.name = props.name;
    this.status = props.status ?? 'ACTIVE';
    this.taxCode = props.taxCode ?? '';
    this.taxCodeMatched = props.taxCodeMatched ?? false;
    this.taxCodeLookupName = props.taxCodeLookupName ?? null;
    this.createdAt = props.createdAt;
  }

  lock(): Organization {
    return new Organization({ ...this, status: 'LOCKED' });
  }

  unlock(): Organization {
    return new Organization({ ...this, status: 'ACTIVE' });
  }

  approve(): Organization {
    return new Organization({ ...this, status: 'ACTIVE' });
  }

  reject(): Organization {
    return new Organization({ ...this, status: 'REJECTED' });
  }
}
