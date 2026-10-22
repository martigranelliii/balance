import type { YearSummary } from "@/lib/finance";
import { formatMoney } from "@/lib/money";

interface AnnualSavingsProps {
  summary: YearSummary;
  variant?: "hero" | "panel";
}

export function AnnualSavings({
  summary,
  variant = "panel",
}: AnnualSavingsProps) {
  if (summary.monthsWithData.length === 0) return null;

  return (
    <div
      className={`annual-savings annual-savings--${variant}${
        summary.savingsCents < 0 ? " annual-savings--negative" : ""
      }`}
    >
      <div className="annual-savings-copy">
        <span className="annual-savings-label">Risparmio annuale</span>
        <span className="annual-savings-note">
          Anno {summary.year} · entrate meno spese, trasferimenti esclusi
        </span>
      </div>
      <strong className="annual-savings-value">
        {formatMoney(summary.savingsCents)}
      </strong>
    </div>
  );
}
