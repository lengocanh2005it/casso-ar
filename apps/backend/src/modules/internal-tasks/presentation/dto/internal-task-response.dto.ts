import type {
  InternalTask,
  InternalTaskStatus,
  InternalTaskType,
} from '../../domain/internal-task';

export interface InternalTaskResponseDto {
  id: string;
  receivableId: string;
  assignedToUserId: string;
  createdByUserId: string | null;
  taskType: InternalTaskType;
  title: string;
  description: string | null;
  dueDate: Date | null;
  status: InternalTaskStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export function toInternalTaskResponse(
  task: InternalTask,
): InternalTaskResponseDto {
  return {
    id: task.id,
    receivableId: task.receivableId,
    assignedToUserId: task.assignedToUserId,
    createdByUserId: task.createdByUserId,
    taskType: task.taskType,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    status: task.status,
    createdAt: task.createdAt,
    resolvedAt: task.resolvedAt,
  };
}
