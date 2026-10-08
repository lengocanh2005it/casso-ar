// The system recovery worklist exposes organization IDs only. Execution rows
// are loaded later under each organization's tenant context.
export interface IReminderExecutionRecoveryWorklist {
  findOrganizationIdsWithStalePendingBefore(
    createdBefore: Date,
  ): Promise<string[]>;
}

export const REMINDER_EXECUTION_RECOVERY_WORKLIST = Symbol(
  'REMINDER_EXECUTION_RECOVERY_WORKLIST',
);
