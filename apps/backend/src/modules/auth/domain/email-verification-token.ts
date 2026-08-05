export interface EmailVerificationTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class EmailVerificationToken {
  declare readonly id: string;
  declare readonly userId: string;
  declare readonly tokenHash: string;
  declare readonly expiresAt: Date;
  declare readonly createdAt: Date;

  constructor(props: EmailVerificationTokenProps) {
    Object.assign(this, props);
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() < now.getTime();
  }
}
