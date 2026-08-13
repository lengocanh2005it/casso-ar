import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { Alert, type AlertType } from '../domain/alert';
import {
  ALERT_REPOSITORY,
  type IAlertRepository,
} from './alert-repository.port';

export const ALERT_CREATED_FOR_USER = 'alert.created-for-user';

export interface AlertCreatedForUserEvent {
  userId: string;
  unreadCount: number;
}

export interface CreateAlertInput {
  organizationId: string;
  userId: string;
  type: AlertType;
  entityType: string;
  entityId: string;
}

@Injectable()
export class CreateAlertUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: CreateAlertInput): Promise<void> {
    const alert = new Alert({
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      readAt: null,
      createdAt: new Date(),
    });
    await this.alertRepo.upsertUnread(alert);
    const unreadCount = await this.alertRepo.countUnread(input.userId);
    this.eventPublisher.emit(ALERT_CREATED_FOR_USER, {
      userId: input.userId,
      unreadCount,
    });
  }
}
