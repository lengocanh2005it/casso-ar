import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IEventPublisher } from './event-publisher.port';

@Injectable()
export class NestEventPublisherAdapter implements IEventPublisher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit(eventName: string, payload: Record<string, unknown>): void {
    this.eventEmitter.emit(eventName, payload);
  }

  async emitAsync(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.eventEmitter.emitAsync(eventName, payload);
  }
}
