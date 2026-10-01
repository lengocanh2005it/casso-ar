import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// The draft body is stored as a single-line HTML string, so the code tab
// would render as one long unreadable row. Break it before block-level tags
// and between tags so the markup reads as a document.
function formatHtmlForDisplay(html: string): string {
  return html
    .replace(/>\s*</g, '>\n<')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function EmailDraftPreview({
  subject,
  recipientEmail,
  bodyHtml,
  compact = false,
}: {
  subject: string;
  recipientEmail: string;
  bodyHtml: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const previewHtml = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        padding: 16px;
        background: #f1f5f9;
        color: #334155;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 14px;
        line-height: 1.6;
      }
      .email-content {
        max-width: 600px;
        margin: 0 auto;
        padding: 24px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
      }
      .email-content > :first-child { margin-top: 0; }
      .email-content > :last-child { margin-bottom: 0; }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; border-collapse: collapse; }
      @media (max-width: 480px) {
        body { padding: 8px; }
        .email-content { padding: 12px; }
      }
    </style>
  </head>
  <body><div class="email-content">${bodyHtml}</div></body>
</html>`;

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(bodyHtml);
      toast.success('Đã sao chép mã HTML.');
    } catch {
      toast.error('Không thể sao chép mã HTML.');
    }
  }

  return (
    <Card
      className={cn(
        'shadow-none',
        compact
          ? 'rounded-none border-0 bg-transparent p-0 shadow-none'
          : 'border-muted bg-muted/20',
      )}
    >
      {!compact && (
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="break-words text-sm">{subject}</CardTitle>
          <p className="break-words text-xs text-muted-foreground">
            {recipientEmail}
          </p>
        </CardHeader>
      )}
      <CardContent className={cn('pt-0', compact && 'p-0')}>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as 'preview' | 'code')}
        >
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="preview">Xem trước</TabsTrigger>
              <TabsTrigger value="code">Mã HTML</TabsTrigger>
            </TabsList>
            {mode === 'code' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyHtml()}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Sao chép
              </Button>
            )}
          </div>
          <TabsContent value="preview">
            <iframe
              title="Xem trước email"
              sandbox=""
              srcDoc={previewHtml}
              className={cn(
                'w-full rounded-md border bg-muted',
                compact ? 'h-72' : 'h-64',
              )}
            />
          </TabsContent>
          <TabsContent value="code">
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
              <code>{formatHtmlForDisplay(bodyHtml)}</code>
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
