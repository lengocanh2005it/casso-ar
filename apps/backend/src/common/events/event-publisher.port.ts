/**
 * Shared application-layer port for publishing domain events. Concrete
 * transport (EventEmitter2, a message broker, ...) is an infrastructure
 * concern — implement it in an adapter, never import it here.
 */
export interface IEventPublisher {
  /** Fire-and-forget: caller does not await listener completion. */
  emit(eventName: string, payload: Record<string, unknown>): void;
  /** Awaits all listeners before resolving. */
  emitAsync(eventName: string, payload: Record<string, unknown>): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
