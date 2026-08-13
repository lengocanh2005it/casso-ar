import type { Alert } from '../domain/alert';

export interface AlertPage {
  items: Alert[];
  total: number;
  unreadCount: number;
}

export interface IAlertRepository {
  /**
   * Insert a new unread alert, or — if an unread alert already exists for
   * the same (userId, entityType, entityId, type) — refresh its createdAt
   * instead of inserting a duplicate row. Backed by a partial unique index
   * on (userId, entityType, entityId, type) WHERE "readAt" IS NULL.
   */
  upsertUnread(alert: Alert): Promise<void>;
  countUnread(userId: string): Promise<number>;
  findPage(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<AlertPage>;
  findByIdForUser(id: string, userId: string): Promise<Alert | null>;
  /** No-op if the alert is already read (idempotent). */
  markRead(id: string, userId: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  deleteAll(userId: string): Promise<void>;
}

export const ALERT_REPOSITORY = Symbol('ALERT_REPOSITORY');
