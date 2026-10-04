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
  // The API treats `from` as the start of its day and `to` through the end of
  // its own, so both ends are counted. Walking back seven days would hand it
  // eight distinct calendar dates while the charts read "7 ngày".
  const from = new Date(now.getTime());
  from.setDate(from.getDate() - 6);
  return {
    from: toLocalDateInputValue(from),
    to: toLocalDateInputValue(now),
  };
}
