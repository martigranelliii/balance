const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const WEEKDAYS = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local calendar date, never an ISO/UTC timestamp. */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthKeyFromDate(date: string): string {
  return date.slice(0, 7);
}

/** Parses at local noon to avoid daylight-saving midnight edge cases. */
export function parseISODate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function previousMonth(month: string): string {
  return addMonths(month, -1);
}

export function monthLabel(month: string): string {
  if (!isMonthKey(month)) return "—";
  const [year, monthNumber] = month.split("-").map(Number);
  return `${MONTHS[monthNumber - 1]} ${year}`;
}

export function monthName(month: string): string {
  if (!isMonthKey(month)) return "—";
  const monthNumber = Number(month.split("-")[1]);
  return MONTHS[monthNumber - 1];
}

export function monthYear(month: string): string {
  return month.slice(0, 4);
}

export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function monthTitle(month: string): string {
  return capitalize(monthName(month));
}

export function formatLongDate(date: string): string {
  if (!isISODate(date)) return date;
  const parsed = parseISODate(date);
  return `${parsed.getDate()} ${MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

export function formatShortDate(date: string, withYear = false): string {
  if (!isISODate(date)) return date;
  const parsed = parseISODate(date);
  return `${parsed.getDate()} ${MONTHS[parsed.getMonth()]}${
    withYear ? ` ${parsed.getFullYear()}` : ""
  }`;
}

export function formatDateGroup(
  date: string,
  today: string = todayISO(),
): string {
  if (date === today) return "Oggi";
  const yesterday = new Date(parseISODate(today));
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === toISODate(yesterday)) return "Ieri";
  const currentYear = today.slice(0, 4);
  return capitalize(formatShortDate(date, date.slice(0, 4) !== currentYear));
}

export function weekdayLabel(date: string): string {
  if (!isISODate(date)) return "";
  return WEEKDAYS[parseISODate(date).getDay()];
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** Progress through a month, clamped 0..1. Past months are complete. */
export function monthProgress(
  month: string,
  today: string = todayISO(),
): { ratio: number; elapsed: number; total: number } {
  const total = daysInMonth(month);
  const todayMonth = monthKeyFromDate(today);
  if (month < todayMonth) return { ratio: 1, elapsed: total, total };
  if (month > todayMonth) return { ratio: 0, elapsed: 0, total };
  const elapsed = Math.min(total, dayOfMonth(today));
  return { ratio: total > 0 ? elapsed / total : 0, elapsed, total };
}

export function compareMonth(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Inclusive list of the last N months, oldest first. */
export function recentMonths(month: string, count: number): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) months.push(addMonths(month, -i));
  return months;
}

export function timestampToLocalLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
