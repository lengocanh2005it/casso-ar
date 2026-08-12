import { useState } from 'react';
import { toast } from 'sonner';
import { downloadCsv } from './download-csv';

export function useCsvExport() {
  const [isExporting, setIsExporting] = useState(false);

  async function exportCsv(
    fetchCsv: () => Promise<{ csv: string; truncated?: boolean }>,
    filename: string,
  ): Promise<void> {
    setIsExporting(true);
    try {
      const { csv, truncated } = await fetchCsv();
      downloadCsv(csv, filename);
      if (truncated) {
        toast.warning(
          'Chỉ xuất 10.000 dòng đầu, vui lòng lọc bớt để xuất đầy đủ.',
        );
      }
    } catch {
      toast.error('Không thể xuất CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  return { isExporting, exportCsv };
}
