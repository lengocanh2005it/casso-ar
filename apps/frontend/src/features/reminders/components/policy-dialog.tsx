import { Permission } from '@casso-ar/shared-types';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import {
  useCreateReminderPolicy,
  useUpdateReminderPolicy,
} from '../api/use-reminders';
import type {
  CustomerGroup,
  ReminderPolicy,
  ReminderRuleInput,
} from '../types';
import { EmailTemplateSelect } from './email-template-select';

interface RuleDraft extends ReminderRuleInput {
  key: string;
}

function newRule(): RuleDraft {
  return {
    key: crypto.randomUUID(),
    offsetDays: 0,
    emailTemplateId: '',
    minIntervalDays: 1,
  };
}

function toRuleDrafts(policy: ReminderPolicy | null): RuleDraft[] {
  if (!policy || policy.rules.length === 0) return [newRule()];
  return policy.rules.map((rule) => ({ ...rule, key: rule.id }));
}

export function PolicyDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: ReminderPolicy | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const [customerGroup, setCustomerGroup] = useState<CustomerGroup>('REGULAR');
  const [isActive, setIsActive] = useState(true);
  const [escalationThresholdDays, setEscalationThresholdDays] = useState('');
  const [rules, setRules] = useState<RuleDraft[]>([newRule()]);
  const create = useCreateReminderPolicy();
  const update = useUpdateReminderPolicy();
  const canWrite = hasPermission(
    user?.role ?? null,
    Permission.REMINDER_POLICY_WRITE,
  );
  const mutation = policy ? update : create;

  useEffect(() => {
    if (!open) return;
    setCustomerGroup(policy?.customerGroup ?? 'REGULAR');
    setIsActive(policy?.isActive ?? true);
    setEscalationThresholdDays(
      policy?.escalationThresholdDays?.toString() ?? '',
    );
    setRules(toRuleDrafts(policy));
  }, [open, policy]);

  if (!canWrite) return null;

  function setRule(
    index: number,
    field: keyof ReminderRuleInput,
    value: string,
  ) {
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              [field]: field === 'emailTemplateId' ? value : Number(value),
            }
          : rule,
      ),
    );
  }

  function submit() {
    const cleanedRules = rules.map(({ key: _key, ...rule }) => rule);
    if (
      cleanedRules.some(
        (rule) =>
          !rule.emailTemplateId.trim() ||
          !Number.isInteger(rule.offsetDays) ||
          !Number.isInteger(rule.minIntervalDays) ||
          rule.minIntervalDays < 0,
      )
    ) {
      toast.error('Vui lòng nhập đầy đủ và đúng các quy tắc nhắc.');
      return;
    }

    const threshold = escalationThresholdDays.trim()
      ? Number(escalationThresholdDays)
      : undefined;
    if (
      threshold !== undefined &&
      (!Number.isInteger(threshold) || threshold <= 0)
    ) {
      toast.error('Ngưỡng leo thang phải là số nguyên dương.');
      return;
    }

    const input = {
      customerGroup,
      isActive,
      escalationThresholdDays: threshold,
      rules: cleanedRules,
    };

    if (policy) {
      update.mutate(
        { id: policy.id, input },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(input, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {policy ? 'Sửa chính sách nhắc' : 'Tạo chính sách nhắc'}
          </DialogTitle>
          <DialogDescription>
            Chọn nhóm khách hàng và các mốc gửi email nhắc thanh toán.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="block space-y-2">
            <span className="block">Nhóm khách hàng</span>
            <Select
              value={customerGroup}
              onValueChange={(value) =>
                setCustomerGroup(value as CustomerGroup)
              }
            >
              <SelectTrigger
                name="customerGroup"
                aria-label="Nhóm khách hàng"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIP">VIP</SelectItem>
                <SelectItem value="REGULAR">Thông thường</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Kích hoạt chính sách
          </label>
          <Label className="block space-y-2">
            <span className="block">
              Ngưỡng leo thang (ngày, không bắt buộc)
            </span>
            <Input
              name="escalationThresholdDays"
              autoComplete="off"
              type="number"
              min={1}
              step={1}
              value={escalationThresholdDays}
              onChange={(event) =>
                setEscalationThresholdDays(event.target.value)
              }
            />
          </Label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Quy tắc nhắc</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRules((current) => [...current, newRule()])}
              >
                Thêm quy tắc
              </Button>
            </div>
            {rules.map((rule, index) => (
              <div
                key={rule.key}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)_minmax(0,190px)_auto] sm:items-end"
              >
                <Label className="block min-w-0 space-y-2">
                  <span className="block text-xs">Ngày lệch hạn</span>
                  <Input
                    name={`offsetDays-${index}`}
                    autoComplete="off"
                    aria-label={`Ngày lệch hạn ${index + 1}`}
                    type="number"
                    step={1}
                    value={rule.offsetDays}
                    onChange={(event) =>
                      setRule(index, 'offsetDays', event.target.value)
                    }
                  />
                </Label>
                <Label className="block min-w-0 space-y-2">
                  <span className="block text-xs">Mẫu email</span>
                  <EmailTemplateSelect
                    id={`emailTemplateId-${index}`}
                    ariaLabel={`Mẫu email ${index + 1}`}
                    value={rule.emailTemplateId}
                    onChange={(templateId) =>
                      setRule(index, 'emailTemplateId', templateId)
                    }
                  />
                </Label>
                <Label className="block min-w-0 space-y-2">
                  <span className="block text-xs">
                    Khoảng cách tối thiểu (ngày)
                  </span>
                  <Input
                    name={`minIntervalDays-${index}`}
                    autoComplete="off"
                    aria-label={`Khoảng cách tối thiểu ${index + 1}`}
                    type="number"
                    min={0}
                    step={1}
                    value={rule.minIntervalDays}
                    onChange={(event) =>
                      setRule(index, 'minIntervalDays', event.target.value)
                    }
                  />
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rules.length === 1}
                  onClick={() =>
                    setRules((current) =>
                      current.filter((_, ruleIndex) => ruleIndex !== index),
                    )
                  }
                >
                  Xóa
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={submit}>
            {mutation.isPending ? 'Đang lưu…' : 'Lưu chính sách'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
