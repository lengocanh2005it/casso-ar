export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class RefreshToken {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: RefreshTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.revokedAt = props.revokedAt;
    this.createdAt = props.createdAt;
  }

  isValid(now: Date): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() >= now.getTime();
  }

  revoke(): RefreshToken {
    return new RefreshToken({ ...this, revokedAt: new Date() });
  }
}
