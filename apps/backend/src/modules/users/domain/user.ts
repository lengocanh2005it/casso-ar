export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export class User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.passwordHash = props.passwordHash;
    this.emailVerifiedAt = props.emailVerifiedAt;
    this.createdAt = props.createdAt;
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
