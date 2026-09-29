import { ArrowRight, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Order matters: invoice import is what creates customers and receivables,
// and only then can incoming bank money be matched against them.
const STEPS = [
  {
    to: '/receivables',
    title: 'Nhập hóa đơn từ file',
    hint: 'Tải file .xlsx hoặc .csv — khách hàng và khoản phải thu được tạo tự động.',
  },
  {
    to: '/exceptions',
    title: 'Đối soát tiền về',
    hint: 'Giao dịch từ tài khoản đã kết nối tự khớp vào công nợ; khoản chưa khớp chờ bạn xử lý.',
  },
] as const;

export function GettingStartedCard() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket aria-hidden="true" className="size-4 text-primary" />
          <CardTitle>Bắt đầu theo dõi công nợ</CardTitle>
        </div>
        <CardDescription>
          Tài khoản ngân hàng đã kết nối. Còn hai bước để Casso AR tự thu hồi
          công nợ cho bạn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.to}>
              <Link
                to={step.to}
                className="group flex h-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors pointer-hover:hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-medium">{step.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {step.hint}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform pointer-hover:group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
