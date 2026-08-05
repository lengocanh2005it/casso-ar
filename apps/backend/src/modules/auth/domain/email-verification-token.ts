export interface EmailVerificationTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class EmailVerificationToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;

  constructor(props: EmailVerificationTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt;
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() < now.getTime();
  }
}
