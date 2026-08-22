import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function EmailDraftPreview({
  subject,
  recipientEmail,
  bodyHtml,
}: {
  subject: string;
  recipientEmail: string;
  bodyHtml: string;
}) {
  const [mode, setMode] = useState<'preview' | 'code'>('preview');

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(bodyHtml);
      toast.success('Đã sao chép mã HTML.');
    } catch {
      toast.error('Không thể sao chép mã HTML.');
    }
  }

  return (
    <Card className="border-muted bg-muted/20 shadow-none">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="break-words text-sm">{subject}</CardTitle>
        <p className="break-words text-xs text-muted-foreground">
          {recipientEmail}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as 'preview' | 'code')}
        >
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="code">HTML code</TabsTrigger>
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
              srcDoc={bodyHtml}
              className="h-64 w-full rounded-md border bg-white"
            />
          </TabsContent>
          <TabsContent value="code">
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
              <code>{bodyHtml}</code>
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
