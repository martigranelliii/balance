/**
 * All monetary values in Balance are integer euro cents.
 * These helpers are the only place where user-entered money becomes numbers.
 */

export function isSafeCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
  );
}

export function normalizeCents(value: unknown): number {
  return isSafeCents(value) ? value : 0;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += normalizeCents(value);
  }
  return total;
}

/**
 * Accepts Italian and common English decimal input: "12,50", "12.50",
 * "1.234,56", "€ 12,50". Returns null for malformed or over-precise input.
 */
export function parseAmountToCents(input: string): number | null {
  if (typeof input !== "string") return null;
  let value = input
    .trim()
    .replace(/[€\s\u00a0\u202f]/g, "")
    .replace(/'/g, "");

  if (!value) return null;

  let negative = false;
  if (value.startsWith("-") || value.startsWith("−")) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }

  if (!value || !/^[0-9.,]+$/.test(value)) return null;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  let integerPart = value;
  let fractionPart = "";

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalIndex = Math.max(lastComma, lastDot);
    integerPart = value.slice(0, decimalIndex).replace(/[.,]/g, "");
    fractionPart = value.slice(decimalIndex + 1);
    if (fractionPart.includes(",") || fractionPart.includes(".")) return null;
  } else if (lastComma !== -1) {
    const pieces = value.split(",");
    if (pieces.length > 2) return null;
    integerPart = pieces[0];
    fractionPart = pieces[1] ?? "";
  } else if (lastDot !== -1) {
    const pieces = value.split(".");
    if (pieces.length > 2) {
      // Grouped thousands, e.g. 1.234.567
      if (!/^\d{1,3}(\.\d{3})+$/.test(value)) return null;
      integerPart = pieces.join("");
    } else if (/^\d{1,3}(\.\d{3})$/.test(value)) {
      // Ambiguous, but a three-digit group after a dot is treated as thousands
      // in the Italian format (1.500 = 1500).
      integerPart = pieces.join("");
    } else {
      integerPart = pieces[0];
      fractionPart = pieces[1] ?? "";
    }
  }

  if (!integerPart) integerPart = "0";
  if (!/^\d+$/.test(integerPart)) return null;
  if (fractionPart && !/^\d+$/.test(fractionPart)) return null;
  if (fractionPart.length > 2) return null;

  const centsPart = (fractionPart + "00").slice(0, 2);
  const whole = Number(integerPart);
  if (!Number.isSafeInteger(whole)) return null;
  const cents = whole * 100 + Number(centsPart);
  if (!Number.isSafeInteger(cents)) return null;

  return negative ? -cents : cents;
}

const wholeFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/** 1250 -> "€12,50" */
export function formatMoney(cents: number): string {
  const safe = normalizeCents(cents);
  const sign = safe < 0 ? "−" : "";
  return `${sign}€${wholeFormatter.format(Math.abs(safe) / 100)}`;
}

/** 1250 -> "+€12,50"; -1250 -> "−€12,50" */
export function formatSignedMoney(cents: number): string {
  const safe = normalizeCents(cents);
  const sign = safe > 0 ? "+" : safe < 0 ? "−" : "";
  return `${sign}€${wholeFormatter.format(Math.abs(safe) / 100)}`;
}

/** 1250 -> "12,50" (for inputs) */
export function formatAmountInput(cents: number): string {
  const safe = normalizeCents(cents);
  return (Math.abs(safe) / 100).toFixed(2).replace(".", ",");
}

/** 0.684 -> "68%" / 0.6843 with decimals -> "68,4%" */
export function formatPercent(ratio: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(ratio)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "percent",
    maximumFractionDigits,
  }).format(ratio);
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function ratio(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return part / total;
}
