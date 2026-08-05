export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export class User {
  declare readonly id: string;
  declare readonly name: string;
  declare readonly email: string;
  declare readonly passwordHash: string;
  declare readonly emailVerifiedAt: Date | null;
  declare readonly createdAt: Date;

  constructor(props: UserProps) {
    Object.assign(this, props);
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
