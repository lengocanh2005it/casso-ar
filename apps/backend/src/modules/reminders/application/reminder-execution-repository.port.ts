export interface IReminderExecutionRepository {
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
}

export const REMINDER_EXECUTION_REPOSITORY = Symbol(
  'REMINDER_EXECUTION_REPOSITORY',
);
