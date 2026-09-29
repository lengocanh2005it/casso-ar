import { REFRESH_TOKEN_GRACE_WINDOW_MS } from '../refresh-token-ttl';

export interface RefreshTokenProps {
  id: string;
  userId: string;
  // One login = one session; rotation and grace issuance inherit it, so a
  // logout can end every token of that device session. Null on tokens issued
  // before sessions existed.
  sessionId: string | null;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}

export class RefreshToken {
  declare readonly id: string;
  declare readonly userId: string;
  declare readonly sessionId: string | null;
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

  // Ends the token without changing how it got there: a token already rotated
  // keeps its successor link.
  revoke(): RefreshToken {
    return new RefreshToken({ ...this, revokedAt: new Date() });
  }

  // Ends the token because `successorId` replaces it.
  rotate(successorId: string): RefreshToken {
    return new RefreshToken({
      ...this,
      revokedAt: new Date(),
      replacedByTokenId: successorId,
    });
  }

  // True when this rotated token is being presented again only a moment after
  // its rotation — a cancelled reload or a tab race, not theft (ADR-0030).
  // The window is measured from the successor's createdAt (timestamptz), not
  // from revokedAt, which is a timezone-less column.
  canReplayAsRace(successor: RefreshToken | null, now: Date): boolean {
    return (
      this.replacedByTokenId !== null &&
      this.expiresAt.getTime() >= now.getTime() &&
      successor !== null &&
      successor.id === this.replacedByTokenId &&
      successor.revokedAt === null &&
      now.getTime() - successor.createdAt.getTime() <=
        REFRESH_TOKEN_GRACE_WINDOW_MS
    );
  }
}
