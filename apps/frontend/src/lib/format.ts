const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
});

export function formatVND(amount: number): string {
  return vndFormatter.format(amount);
}

const compactNumberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
});

// A full formatVND() amount (e.g. "300.000.000 ₫") is too wide for a chart
// axis label — long labels get clipped by the SVG's own bounds. Abbreviate
// to triệu/tỷ instead, matching how Vietnamese readers scan large amounts.
export function formatVNDCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return `${compactNumberFormatter.format(amount / 1_000_000_000)}tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${compactNumberFormatter.format(amount / 1_000_000)}tr`;
  }
  return compactNumberFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDate(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return dateFormatter.format(date);
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return dateTimeFormatter.format(date);
}
