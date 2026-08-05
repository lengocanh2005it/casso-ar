export interface PasswordResetTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export class PasswordResetToken {
  declare readonly id: string;
  declare readonly userId: string;
  declare readonly tokenHash: string;
  declare readonly expiresAt: Date;
  declare readonly usedAt: Date | null;
  declare readonly createdAt: Date;

  constructor(props: PasswordResetTokenProps) {
    Object.assign(this, props);
  }

  isValid(now: Date): boolean {
    return this.usedAt === null && this.expiresAt.getTime() >= now.getTime();
  }

  markUsed(): PasswordResetToken {
    return new PasswordResetToken({ ...this, usedAt: new Date() });
  }
}
