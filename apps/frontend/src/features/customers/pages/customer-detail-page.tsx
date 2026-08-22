import { CreditCard, History, Receipt, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeading } from '@/components/layout/page-heading';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useReceivables } from '@/features/receivables/api/use-receivables';
import { formatDate, formatVND } from '@/lib/format';
import type { CustomerCredits } from '../api/customers-api';
import {
  useCustomer,
  useCustomerCredits,
  useCustomerTimeline,
} from '../api/use-customers';
import { AllocateCreditDialog } from '../components/allocate-credit-dialog';
import { CustomerBankAccountsCard } from '../components/customer-bank-accounts-card';
import { CustomerTimeline } from '../components/customer-timeline';

export function CustomerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const customerQuery = useCustomer(id);
  const timelineQuery = useCustomerTimeline(id);
  const creditsQuery = useCustomerCredits(id);
  const receivablesQuery = useReceivables({ customerId: id }, 1, 100);
  const [selectedPayment, setSelectedPayment] = useState<
    CustomerCredits['items'][number] | null
  >(null);

  if (customerQuery.isPending) {
    return (
      <p role="status" aria-live="polite">
        Đang tải thông tin khách hàng…
      </p>
    );
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <div className="space-y-3">
        <Link
          to="/customers"
          className="text-sm text-primary pointer-hover:hover:underline"
        >
          ← Quay lại khách hàng
        </Link>
        <p role="alert" aria-live="polite" className="text-destructive">
          Không thể tải thông tin khách hàng.
        </p>
      </div>
    );
  }

  const customer = customerQuery.data;

  return (
    <div className="space-y-5">
      <Link
        to="/customers"
        className="text-sm text-primary pointer-hover:hover:underline"
      >
        ← Quay lại khách hàng
      </Link>
      <PageHeading
        eyebrow="HỒ SƠ KHÁCH HÀNG"
        title={customer.name}
        icon={Users}
        tone="info"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users aria-hidden="true" className="size-4 text-info" />
              <CardTitle>Thông tin liên hệ</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Email: {customer.email ?? '—'}</p>
            <p>Số điện thoại: {customer.phone ?? '—'}</p>
            <p>Mã số thuế: {customer.taxCode ?? '—'}</p>
            <p>Ngày tạo: {formatDate(customer.createdAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard aria-hidden="true" className="size-4 text-primary" />
              <CardTitle>Điều khoản công nợ</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Hạn thanh toán mặc định: {customer.defaultPaymentTermDays} ngày
            </p>
            <p>
              Hạn mức tín dụng:{' '}
              {customer.creditLimit === null
                ? 'Không giới hạn'
                : formatVND(customer.creditLimit)}
            </p>
            <p>Ưu tiên: {customer.priority ?? '—'}</p>
          </CardContent>
        </Card>
      </div>
      <CustomerBankAccountsCard customerId={id} />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4 text-success" />
            <CardTitle>Lịch sử hoạt động</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {timelineQuery.isPending && (
            <p role="status" aria-live="polite">
              Đang tải hoạt động…
            </p>
          )}
          {timelineQuery.isError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải lịch sử hoạt động.
            </p>
          )}
          {timelineQuery.data && (
            <CustomerTimeline items={timelineQuery.data.items} />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard aria-hidden="true" className="size-4 text-info" />
              <CardTitle>Số dư tín dụng</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {creditsQuery.isPending && (
              <p role="status" aria-live="polite">
                Đang tải…
              </p>
            )}
            {creditsQuery.isError && (
              <p role="alert" aria-live="polite" className="text-destructive">
                Không thể tải số dư tín dụng.
              </p>
            )}
            {creditsQuery.data && (
              <>
                <p>
                  Số dư khả dụng:{' '}
                  <strong>
                    {formatVND(creditsQuery.data.totalAvailableAmount)}
                  </strong>
                </p>
                <p className="text-muted-foreground">
                  {creditsQuery.data.items.length} khoản thanh toán chưa phân bổ
                </p>
                {creditsQuery.data.items.length > 0 ? (
                  <ul className="space-y-2 pt-2">
                    {creditsQuery.data.items.map((payment) => (
                      <li
                        key={payment.paymentId}
                        className="flex items-center justify-between gap-3 rounded-md border p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {payment.payerName || 'Khoản thanh toán'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Chưa phân bổ: {formatVND(payment.unallocatedAmount)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Phân bổ ${payment.paymentId}`}
                          onClick={() => setSelectedPayment(payment)}
                        >
                          Phân bổ
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    density="compact"
                    icon={CreditCard}
                    title="Chưa có khoản thanh toán chưa phân bổ"
                    description="Các khoản thanh toán chờ phân bổ sẽ hiển thị tại đây."
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt aria-hidden="true" className="size-4 text-primary" />
              <CardTitle>Khoản phải thu</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {receivablesQuery.isPending && (
              <p role="status" aria-live="polite">
                Đang tải…
              </p>
            )}
            {receivablesQuery.isError && (
              <p role="alert" aria-live="polite" className="text-destructive">
                Không thể tải khoản phải thu.
              </p>
            )}
            {receivablesQuery.data && (
              <>
                <p>Tổng cộng: {receivablesQuery.data.total} khoản phải thu</p>
                {receivablesQuery.data.items.length > 0 ? (
                  <ul className="space-y-1">
                    {receivablesQuery.data.items
                      .slice(0, 5)
                      .map((receivable) => (
                        <li
                          key={receivable.id}
                          className="flex justify-between gap-2"
                        >
                          <ReceivableStatusBadge status={receivable.status} />
                          <span className="tabular-nums">
                            {formatVND(receivable.remainingAmount)}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <EmptyState
                    density="compact"
                    icon={Receipt}
                    title="Chưa có khoản phải thu"
                    description="Các khoản công nợ của khách hàng sẽ hiển thị tại đây."
                  />
                )}
                {receivablesQuery.data.total > 5 && (
                  <Link
                    to={`/receivables?customerId=${encodeURIComponent(id)}`}
                    className="text-primary pointer-hover:hover:underline"
                  >
                    Xem tất cả →
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {selectedPayment && (
        <AllocateCreditDialog
          payment={selectedPayment}
          receivables={receivablesQuery.data?.items ?? []}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSelectedPayment(null);
            }
          }}
        />
      )}
    </div>
  );
}
