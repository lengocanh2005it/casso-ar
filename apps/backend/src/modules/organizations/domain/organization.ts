export type OrganizationStatus = 'ACTIVE' | 'LOCKED';

export interface OrganizationProps {
  id: string;
  name: string;
  status?: OrganizationStatus;
  createdAt: Date;
}

export class Organization {
  readonly id: string;
  readonly name: string;
  readonly status: OrganizationStatus;
  readonly createdAt: Date;

  constructor(props: OrganizationProps) {
    this.id = props.id;
    this.name = props.name;
    this.status = props.status ?? 'ACTIVE';
    this.createdAt = props.createdAt;
  }

  lock(): Organization {
    return new Organization({ ...this, status: 'LOCKED' });
  }

  unlock(): Organization {
    return new Organization({ ...this, status: 'ACTIVE' });
  }
}
