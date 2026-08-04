export interface CustomerProps {
  id: string;
  organizationId: string;
  name: string;
  taxCode: string;
  email: string;
  phone: string;
  defaultPaymentTermDays: number;
  creditLimit: number;
  priority: number;
  createdAt: Date;
}

export class Customer {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly taxCode: string;
  readonly email: string;
  readonly phone: string;
  readonly defaultPaymentTermDays: number;
  readonly creditLimit: number;
  readonly priority: number;
  readonly createdAt: Date;

  constructor(props: CustomerProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.name = props.name;
    this.taxCode = props.taxCode;
    this.email = props.email;
    this.phone = props.phone;
    this.defaultPaymentTermDays = props.defaultPaymentTermDays;
    this.creditLimit = props.creditLimit;
    this.priority = props.priority;
    this.createdAt = props.createdAt;
  }
}
