export interface OrganizationProps {
  id: string;
  name: string;
  createdAt: Date;
}

export class Organization {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;

  constructor(props: OrganizationProps) {
    this.id = props.id;
    this.name = props.name;
    this.createdAt = props.createdAt;
  }
}
