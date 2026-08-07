import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  DisputeEventName,
  DisputeEventPayload,
  IEventPublisher,
} from '../application/event-publisher.port';

@Injectable()
export class NestEventPublisherAdapter implements IEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(name: DisputeEventName, payload: DisputeEventPayload): void {
    this.eventEmitter.emit(name, payload);
  }
}
