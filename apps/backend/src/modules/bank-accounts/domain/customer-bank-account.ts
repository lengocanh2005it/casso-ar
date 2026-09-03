export interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string;
  isActive: boolean;
  // A row is an authorization LINK between a customer and a third-party payer
  // account, not the customer's own account. The same accountNumber may appear
  // against multiple customerIds within one organization (issue #382).
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerBankAccount {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly accountNumber: string;
  readonly isActive: boolean;
  readonly confirmedByUserId: string | null;
  readonly confirmedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CustomerBankAccountProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.accountNumber = props.accountNumber;
    this.isActive = props.isActive;
    this.confirmedByUserId = props.confirmedByUserId ?? null;
    this.confirmedAt = props.confirmedAt ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
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

  // Changing the linked account number is a re-confirmation of the link, so the
  // caller must pass who confirmed it and when — never left to a default, which
  // would silently wipe the previous provenance (issue #382, AC#3).
  changeAccountNumber(
    accountNumber: string,
    confirmedByUserId: string | null,
    confirmedAt: Date,
  ): CustomerBankAccount {
    return new CustomerBankAccount({
      ...this,
      accountNumber,
      confirmedByUserId,
      confirmedAt,
      updatedAt: new Date(),
    });
  }
}
