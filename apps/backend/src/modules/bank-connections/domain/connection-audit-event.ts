export type ConnectionAuditEventType =
  | 'SESSION_CREATED'
  | 'TOKEN_EXCHANGED'
  | 'API_CALL_FAILED_401'
  | 'API_CALL_FAILED'
  | 'MARKED_REQUIRES_REAUTH'
  | 'MARKED_ERROR'
  | 'RECONNECTED'
  | 'DISCONNECTED'
  | 'API_KEY_ROTATED'
  | 'API_KEY_REVEALED';

export interface ConnectionAuditEventProps {
  id: string;
  organizationId: string;
  bankConnectionId: string;
  eventType: ConnectionAuditEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class ConnectionAuditEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly bankConnectionId: string;
  readonly eventType: ConnectionAuditEventType;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;

  constructor(props: ConnectionAuditEventProps) {
    Object.assign(this, props);
  }
}
