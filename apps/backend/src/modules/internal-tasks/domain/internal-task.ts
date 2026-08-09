export type InternalTaskType = 'ESCALATION' | 'MANUAL';
export type InternalTaskStatus = 'OPEN' | 'DONE' | 'DISMISSED';

export interface InternalTaskProps {
  id: string;
  organizationId: string;
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
  version: number;
}

export class InternalTask {
  readonly id: string;
  readonly organizationId: string;
  readonly receivableId: string;
  readonly assignedToUserId: string;
  readonly createdByUserId: string | null;
  readonly taskType: InternalTaskType;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: Date | null;
  readonly status: InternalTaskStatus;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly version: number;

  constructor(props: InternalTaskProps) {
    Object.assign(this, props);
  }

  private withProps(overrides: Partial<InternalTaskProps>): InternalTask {
    return new InternalTask({ ...this, ...overrides });
  }

  resolve(): InternalTask {
    if (this.status !== 'OPEN') {
      throw new Error(`Cannot resolve a task in status ${this.status}`);
    }
    return this.withProps({ status: 'DONE', resolvedAt: new Date() });
  }

  dismiss(): InternalTask {
    if (this.status !== 'OPEN') {
      throw new Error(`Cannot dismiss a task in status ${this.status}`);
    }
    return this.withProps({ status: 'DISMISSED', resolvedAt: new Date() });
  }
}
