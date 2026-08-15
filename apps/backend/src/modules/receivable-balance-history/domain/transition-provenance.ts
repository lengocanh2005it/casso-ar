import type { BalanceHistoryActorType } from './balance-history-actor-type';

export interface TransitionProvenance {
  actorType: BalanceHistoryActorType;
  actorUserId: string | null;
}
