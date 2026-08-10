import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatVND } from '@/lib/format';
import { useCustomer, useCustomerTimeline } from '../api/use-customers';
import { CustomerTimeline } from '../components/customer-timeline';

export function CustomerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const customerQuery = useCustomer(id);
  const timelineQuery = useCustomerTimeline(id);

  if (customerQuery.isPending) {
    return <p>Đang tải thông tin khách hàng…</p>;
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <div className="space-y-3">
        <Link to="/customers" className="text-sm text-primary hover:underline">
          ← Quay lại khách hàng
        </Link>
        <p className="text-destructive">Không thể tải thông tin khách hàng.</p>
      </div>
    );
  }

  const customer = customerQuery.data;

  return (
    <div className="space-y-6">
      <Link to="/customers" className="text-sm text-primary hover:underline">
        ← Quay lại khách hàng
      </Link>
      <div>
        <p className="text-sm font-medium text-primary">HỒ SƠ KHÁCH HÀNG</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {customer.name}
        </h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin liên hệ</CardTitle>
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
            <CardTitle>Điều khoản công nợ</CardTitle>
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
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử hoạt động</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineQuery.isPending && <p>Đang tải hoạt động…</p>}
          {timelineQuery.isError && (
            <p className="text-destructive">Không thể tải lịch sử hoạt động.</p>
          )}
          {timelineQuery.data && (
            <CustomerTimeline items={timelineQuery.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
