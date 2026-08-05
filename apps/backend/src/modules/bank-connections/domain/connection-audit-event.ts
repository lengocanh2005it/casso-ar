export type ConnectionAuditEventType =
  | 'SESSION_CREATED'
  | 'TOKEN_EXCHANGED'
  | 'API_CALL_FAILED_401'
  | 'MARKED_REQUIRES_REAUTH'
  | 'RECONNECTED'
  | 'DISCONNECTED';

export interface ConnectionAuditEventProps {
  id: string;
  bankConnectionId: string;
  eventType: ConnectionAuditEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export class ConnectionAuditEvent {
  readonly id: string;
  readonly bankConnectionId: string;
  readonly eventType: ConnectionAuditEventType;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;

  constructor(props: ConnectionAuditEventProps) {
    Object.assign(this, props);
  }
}
