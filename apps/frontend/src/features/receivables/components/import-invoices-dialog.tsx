import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { type ImportResult, importInvoices } from '../api/import-api';

const ERROR_LABELS: Record<string, string> = {
  DUPLICATE_INVOICE_NUMBER: 'Số hóa đơn đã tồn tại',
  CUSTOMER_MISMATCH: 'Thông tin khách hàng không khớp',
  PLAN_LIMIT_EXCEEDED: 'Đã vượt hạn mức gói dịch vụ',
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ',
  IMPORT_ROW_FAILED: 'Không thể nhập dòng này',
};

function getErrorLabel(code: string): string {
  return ERROR_LABELS[code] ?? 'Dòng dữ liệu không hợp lệ';
}

export function ImportInvoicesDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_IMPORT)) {
    return null;
  }

  function reset() {
    setFile(null);
    setResult(null);
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const response = await importInvoices(file);
      setResult(response);
      toast.success(`Đã nhập thành công ${response.successCount} dòng`);
    } catch {
      toast.error('Nhập file thất bại');
    } finally {
      setUploading(false);
    }
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
        <Button variant="outline">Nhập hóa đơn</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nhập hóa đơn</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Tải lên file CSV hoặc XLSX để tạo hóa đơn và khoản phải thu.
        </DialogDescription>
        {!result ? (
          <div className="space-y-3">
            <input
              aria-label="File hóa đơn"
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button onClick={onUpload} disabled={!file || uploading}>
              {uploading ? 'Đang tải lên…' : 'Tải lên'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p>
              <span>Đã nhập thành công {result.successCount} dòng</span>. Các
              dòng lỗi bị bỏ qua; số tiền còn lại không bị ảnh hưởng.
            </p>
            {result.failedRows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dòng</TableHead>
                    <TableHead>Lý do</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.failedRows.map((failure) => (
                    <TableRow key={failure.rowNumber}>
                      <TableCell>{failure.rowNumber}</TableCell>
                      <TableCell>
                        {failure.errors.map(getErrorLabel).join('; ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
