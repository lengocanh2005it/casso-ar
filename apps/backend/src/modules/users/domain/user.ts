export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  isOperator?: boolean;
  createdAt: Date;
}

export class User {
  declare readonly id: string;
  declare readonly name: string;
  declare readonly email: string;
  declare readonly passwordHash: string;
  declare readonly emailVerifiedAt: Date | null;
  declare readonly isOperator: boolean;
  declare readonly createdAt: Date;

  constructor(props: UserProps) {
    Object.assign(this, { ...props, isOperator: props.isOperator ?? false });
  }

  isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null;
  }

  markEmailVerified(): User {
    return new User({ ...this, emailVerifiedAt: new Date() });
  }

  withPasswordHash(passwordHash: string): User {
    return new User({ ...this, passwordHash });
  }
}
