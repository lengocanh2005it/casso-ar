export interface PasswordResetTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export class PasswordResetToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: PasswordResetTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.createdAt = props.createdAt;
  }

  isValid(now: Date): boolean {
    return this.usedAt === null && this.expiresAt.getTime() >= now.getTime();
  }

  markUsed(): PasswordResetToken {
    return new PasswordResetToken({ ...this, usedAt: new Date() });
  }
}
