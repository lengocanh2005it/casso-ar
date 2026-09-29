export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}

export class RefreshToken {
  declare readonly id: string;
  declare readonly userId: string;
  declare readonly tokenHash: string;
  declare readonly expiresAt: Date;
  declare readonly revokedAt: Date | null;
  declare readonly replacedByTokenId: string | null;
  declare readonly createdAt: Date;

  constructor(props: RefreshTokenProps) {
    Object.assign(this, props);
  }

  isValid(now: Date): boolean {
    return this.revokedAt === null && this.expiresAt.getTime() >= now.getTime();
  }

  revoke(replacedByTokenId: string | null = null): RefreshToken {
    return new RefreshToken({
      ...this,
      revokedAt: new Date(),
      replacedByTokenId,
    });
  }
}
