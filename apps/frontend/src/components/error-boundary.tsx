import { CloudCog, ServerCrash } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

// Vite chunk hashes go stale right after a deploy; one reload almost always
// fixes it, so we only show the fallback UI if that reload didn't help.
const CHUNK_RELOAD_FLAG = 'app-chunk-reload-attempted';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  return CHUNK_LOAD_ERROR_PATTERN.test(error.message);
}

function ErrorPageShell({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-destructive/10 blur-3xl" />
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

      <div className="flex min-h-svh flex-col items-center px-4 pt-10 sm:px-6 sm:pt-14">
        <Logo className="mb-5 h-12 sm:mb-6 sm:h-16" />

        <div className="relative flex w-full max-w-md flex-1 items-center">
          <Card className="relative overflow-hidden border-border/70 bg-card/90 shadow-xl shadow-destructive/5 backdrop-blur-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-destructive/30 via-destructive to-destructive/30" />

            <CardContent className="px-6 py-8 text-center sm:px-10 sm:py-10">
              <div className="relative mx-auto mb-6 flex size-24 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-destructive/10" />
                <div className="absolute inset-2 rounded-full border border-destructive/20 border-dashed" />
                {icon}
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>

              {children}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, errorInfo);
    }

    if (isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
      sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
      window.location.reload();
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error } = this.state;

    if (!hasError || !error) {
      return this.props.children;
    }

    if (isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
      return null;
    }

    if (isChunkLoadError(error)) {
      return (
        <ErrorPageShell
          icon={
            <CloudCog
              className="relative size-9 text-destructive"
              strokeWidth={1.75}
              aria-hidden
            />
          }
          title="Có bản cập nhật mới"
          description="Ứng dụng vừa được cập nhật lên phiên bản mới. Vui lòng tải lại trang để tiếp tục."
        >
          <div className="mt-7">
            <Button
              size="lg"
              className="gap-2 shadow-md shadow-destructive/20"
              onClick={this.handleReload}
            >
              Tải lại trang
            </Button>
          </div>
        </ErrorPageShell>
      );
    }

    return (
      <ErrorPageShell
        icon={
          <ServerCrash
            className="relative size-9 text-destructive"
            strokeWidth={1.75}
            aria-hidden
          />
        }
        title="Đã xảy ra lỗi"
        description="Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại."
      >
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-4 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="gap-2 shadow-md shadow-destructive/20"
            onClick={this.handleReset}
          >
            Thử lại
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="/dashboard">Về trang chủ</a>
          </Button>
        </div>
      </ErrorPageShell>
    );
  }
}
