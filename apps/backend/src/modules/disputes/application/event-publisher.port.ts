export type DisputeEventName = 'dispute.opened' | 'dispute.resolved';

export interface DisputeEventPayload {
  disputeId: string;
  receivableId: string;
  organizationId: string;
}

export interface IEventPublisher {
  emit(name: DisputeEventName, payload: DisputeEventPayload): void;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
