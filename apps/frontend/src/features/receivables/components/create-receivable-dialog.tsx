import { Permission } from '@casso-ar/shared-types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useCustomers } from '@/features/customers/api/use-customers';
import { hasPermission } from '@/lib/rbac';
import { useCreateReceivable } from '../api/use-receivables';

export function CreateReceivableDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const mutation = useCreateReceivable();
  const { data: customerPage } = useCustomers(
    customerSearch,
    1,
    open && customerSearch.trim().length > 0,
  );

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_WRITE)) {
    return null;
  }

  function reset() {
    setCustomerId('');
    setCustomerSearch('');
    setOriginalAmount('');
    setDueDate('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Tạo khoản phải thu</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo khoản phải thu</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(
              {
                customerId,
                originalAmount: Number(originalAmount),
                dueDate,
              },
              {
                onSuccess: () => {
                  reset();
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Label className="block space-y-2" htmlFor="customer-search">
            <span className="block text-sm">Tìm khách hàng</span>
            <Input
              id="customer-search"
              name="customerSearch"
              autoComplete="off"
              required
              value={customerSearch}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setCustomerId('');
              }}
              placeholder="Tên khách hàng, mã số thuế hoặc số điện thoại…"
            />
          </Label>
          {customerPage?.items.length ? (
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger aria-label="Khách hàng" className="w-full">
                <SelectValue placeholder="Chọn khách hàng" />
              </SelectTrigger>
              <SelectContent>
                {customerPage.items.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name || 'Chưa có tên khách hàng'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Label className="block space-y-2">
            <span className="block text-sm">Số tiền (đồng)</span>
            <Input
              name="originalAmount"
              autoComplete="off"
              required
              type="number"
              min={1}
              step={1}
              value={originalAmount}
              onChange={(event) => setOriginalAmount(event.target.value)}
            />
          </Label>
          <Label className="block space-y-2">
            <span className="block text-sm">Hạn thanh toán</span>
            <Input
              name="dueDate"
              autoComplete="off"
              required
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Label>
          {mutation.isError && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              Không thể tạo khoản phải thu.
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending || !customerId}>
            {mutation.isPending ? 'Đang lưu…' : 'Tạo'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
