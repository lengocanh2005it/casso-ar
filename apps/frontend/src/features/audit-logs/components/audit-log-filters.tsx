import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OrganizationMember } from '@/features/settings/types';
import { ACTION_TYPE_OPTIONS, ENTITY_TYPE_OPTIONS } from '../labels';
import type { AuditLogFilters } from '../types';

export interface AuditLogFilterValues {
  actorUserId: string;
  entityType: string;
  actionType: string;
  from: string;
  to: string;
}

export function filterValuesToFilters(
  values: AuditLogFilterValues,
): AuditLogFilters {
  return {
    ...(values.actorUserId ? { actorUserId: values.actorUserId } : {}),
    ...(values.entityType ? { entityType: values.entityType } : {}),
    ...(values.actionType ? { actionType: values.actionType } : {}),
    ...(values.from ? { from: values.from } : {}),
    ...(values.to ? { to: values.to } : {}),
  };
}

interface AuditLogFiltersProps {
  values: AuditLogFilterValues;
  members: OrganizationMember[];
  onChange: (next: AuditLogFilterValues) => void;
}

export function AuditLogFiltersBar({
  values,
  members,
  onChange,
}: AuditLogFiltersProps) {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-2">
        <Label htmlFor="audit-log-from">Từ ngày</Label>
        <Input
          id="audit-log-from"
          name="from"
          type="date"
          autoComplete="off"
          value={values.from}
          onChange={(event) =>
            onChange({ ...values, from: event.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-log-to">Đến ngày</Label>
        <Input
          id="audit-log-to"
          name="to"
          type="date"
          autoComplete="off"
          value={values.to}
          onChange={(event) => onChange({ ...values, to: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-log-actor">Người thực hiện</Label>
        <Select
          value={values.actorUserId || undefined}
          onValueChange={(actorUserId) => onChange({ ...values, actorUserId })}
        >
          <SelectTrigger
            id="audit-log-actor"
            aria-label="Người thực hiện"
            className="w-full"
          >
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-log-entity-type">Đối tượng</Label>
        <Select
          value={values.entityType || undefined}
          onValueChange={(entityType) => onChange({ ...values, entityType })}
        >
          <SelectTrigger
            id="audit-log-entity-type"
            aria-label="Đối tượng"
            className="w-full"
          >
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="audit-log-action-type">Hành động</Label>
        <Select
          value={values.actionType || undefined}
          onValueChange={(actionType) => onChange({ ...values, actionType })}
        >
          <SelectTrigger
            id="audit-log-action-type"
            aria-label="Hành động"
            className="w-full"
          >
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
