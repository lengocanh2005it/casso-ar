import { ArrowLeft, MapPinOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const homeTo = isAuthenticated ? '/dashboard' : '/';
  const homeLabel = isAuthenticated ? 'Về bảng điều khiển' : 'Về trang chủ';

  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-primary/14 blur-3xl" />
        <div className="absolute right-[-4rem] bottom-[-2rem] h-72 w-72 rounded-full bg-chart-2/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.28] dark:opacity-[0.1]"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.45) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage:
              'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 75%)',
          }}
        />
      </div>

      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="flex min-h-svh flex-col items-center px-4 pt-16 sm:px-6 sm:pt-20">
        <Link
          to={homeTo}
          className="mb-10 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mb-14"
        >
          <Logo
            className="h-12 sm:h-16"
            iconClassName="h-12 w-12 sm:h-16 sm:w-16"
            wordmarkClassName="text-2xl sm:text-3xl text-primary"
          />
        </Link>

        <div className="relative w-full max-w-lg flex-1 flex items-center">
          <Card className="relative overflow-hidden border-border/70 bg-card/90 shadow-lg backdrop-blur-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30" />

            <CardContent className="px-6 py-10 text-center sm:px-10 sm:py-12">
              <div className="relative mx-auto mb-8 flex size-28 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-primary/10" />
                <div className="absolute inset-2 rounded-full border border-primary/20 border-dashed" />
                <div className="relative flex flex-col items-center gap-1">
                  <MapPinOff
                    className="size-8 text-primary"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="bg-gradient-to-br from-primary via-primary to-primary/50 bg-clip-text text-5xl font-black tracking-tighter text-transparent">
                    404
                  </span>
                </div>
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Không tìm thấy trang
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Đường dẫn không tồn tại hoặc bạn không có quyền truy cập khu vực
                này. Hãy quay về nơi bạn đang làm việc.
              </p>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <Button
                  asChild
                  size="lg"
                  className="gap-2 shadow-md shadow-primary/20"
                >
                  <Link to={homeTo}>
                    <ArrowLeft className="size-4" />
                    {homeLabel}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => navigate(-1)}
                >
                  Quay lại trang trước
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
