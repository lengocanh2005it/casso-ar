export interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerBankAccount {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly accountNumber: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CustomerBankAccountProps) {
    Object.assign(this, props);
  }

  deactivate(): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      isActive: false,
      updatedAt: new Date(),
    });
  }

  setActive(isActive: boolean): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      isActive,
      updatedAt: new Date(),
    });
  }

  changeAccountNumber(accountNumber: string): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      accountNumber,
      updatedAt: new Date(),
    });
  }
}
