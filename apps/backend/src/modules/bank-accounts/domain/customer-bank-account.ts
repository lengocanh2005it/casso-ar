export interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string;
  createdAt: Date;
}

export class CustomerBankAccount {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly accountNumber: string;
  readonly createdAt: Date;
  constructor(props: CustomerBankAccountProps) {
    Object.assign(this, props);
  }
}
