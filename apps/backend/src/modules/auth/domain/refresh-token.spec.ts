import { REFRESH_TOKEN_GRACE_WINDOW_MS } from '../refresh-token-ttl';
import { RefreshToken, type RefreshTokenProps } from './refresh-token';

const NOW = new Date('2026-09-29T10:00:00.000Z');

function makeToken(overrides: Partial<RefreshTokenProps> = {}): RefreshToken {
  return new RefreshToken({
    id: 'token-1',
    userId: 'user-1',
    sessionId: 'session-1',
    tokenHash: 'hash-1',
    expiresAt: new Date(NOW.getTime() + 60_000),
    revokedAt: null,
    replacedByTokenId: null,
    createdAt: new Date(NOW.getTime() - 3_600_000),
    ...overrides,
  });
}

describe('RefreshToken', () => {
  describe('revoke', () => {
    it('revokes without touching an existing successor link', () => {
      const rotated = makeToken({
        revokedAt: new Date(NOW.getTime() - 1_000),
        replacedByTokenId: 'token-2',
      });

      const revoked = rotated.revoke();

      expect(revoked.replacedByTokenId).toBe('token-2');
    });

    it('records revokedAt and leaves the successor link empty when there was none', () => {
      const revoked = makeToken().revoke();

      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(revoked.replacedByTokenId).toBeNull();
    });
  });

  describe('rotate', () => {
    it('revokes the token and links its successor', () => {
      const rotated = makeToken().rotate('token-2');

      expect(rotated.revokedAt).toBeInstanceOf(Date);
      expect(rotated.replacedByTokenId).toBe('token-2');
    });
  });

  describe('canReplayAsRace', () => {
    function rotatedInto(
      successorAgeMs: number,
      successorOverrides: Partial<RefreshTokenProps> = {},
      rotatedOverrides: Partial<RefreshTokenProps> = {},
    ) {
      const successor = makeToken({
        id: 'token-2',
        createdAt: new Date(NOW.getTime() - successorAgeMs),
        ...successorOverrides,
      });
      const rotated = makeToken({
        revokedAt: new Date(NOW.getTime() - successorAgeMs),
        replacedByTokenId: 'token-2',
        ...rotatedOverrides,
      });
      return { rotated, successor };
    }

    it('accepts a token whose live successor was created inside the window', () => {
      const { rotated, successor } = rotatedInto(3_000);

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(true);
    });

    it('accepts a successor created exactly at the window edge', () => {
      const { rotated, successor } = rotatedInto(REFRESH_TOKEN_GRACE_WINDOW_MS);

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(true);
    });

    it('rejects a successor created after the window', () => {
      const { rotated, successor } = rotatedInto(
        REFRESH_TOKEN_GRACE_WINDOW_MS + 1,
      );

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(false);
    });

    it('measures the window from the successor, not from revokedAt', () => {
      // revokedAt is a timezone-less column and may be hours off; only the
      // successor's createdAt decides.
      const { rotated, successor } = rotatedInto(
        3_000,
        {},
        {
          revokedAt: new Date(NOW.getTime() - 5 * 3_600_000),
        },
      );

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(true);
    });

    it('rejects a token that was never rotated', () => {
      const revokedByLogout = makeToken({ revokedAt: new Date(NOW) });

      expect(revokedByLogout.canReplayAsRace(null, NOW)).toBe(false);
    });

    it('rejects a missing successor', () => {
      const { rotated } = rotatedInto(3_000);

      expect(rotated.canReplayAsRace(null, NOW)).toBe(false);
    });

    it('rejects a successor that is not the linked one', () => {
      const { rotated, successor } = rotatedInto(3_000, { id: 'other' });

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(false);
    });

    it('rejects a revoked successor', () => {
      const { rotated, successor } = rotatedInto(3_000, {
        revokedAt: new Date(NOW),
      });

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(false);
    });

    it('rejects a token that had already expired', () => {
      const { rotated, successor } = rotatedInto(
        3_000,
        {},
        { expiresAt: new Date(NOW.getTime() - 1) },
      );

      expect(rotated.canReplayAsRace(successor, NOW)).toBe(false);
    });
  });
});
