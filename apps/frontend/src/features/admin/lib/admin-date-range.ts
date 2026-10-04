// <input type="date"> and the admin usage API both speak calendar days, so
// build them from local getters. toISOString() would shift to UTC and hand
// back yesterday for anyone east of Greenwich before 07:00 local.
function toLocalDateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function last7DayRange(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: toLocalDateInputValue(from),
    to: toLocalDateInputValue(now),
  };
}
