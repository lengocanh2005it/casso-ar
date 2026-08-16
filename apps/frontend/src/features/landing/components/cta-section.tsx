import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function CtaSection() {
  return (
    <section className="pb-20 sm:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12 sm:py-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Sẵn sàng quản lý công nợ dễ dàng hơn?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/90">
            Tạo tài khoản miễn phí và bắt đầu ngay hôm nay.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              className="h-12 w-full sm:w-auto"
              asChild
            >
              <Link to="/signup">Dùng thử miễn phí</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full border-primary-foreground/40 bg-transparent text-primary-foreground pointer-hover:hover:bg-primary-foreground/10 sm:w-auto"
              asChild
            >
              <Link to="/login">Đã có tài khoản</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
