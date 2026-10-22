"use client";

import { Icon } from "./Icon";
import {
  monthName,
  monthYear,
  currentMonthKey,
  capitalize,
} from "@/lib/dates";

interface MonthNavProps {
  month: string;
  onChange: (month: string) => void;
  variant?: "large" | "compact";
}

export function MonthNav({ month, onChange, variant = "compact" }: MonthNavProps) {
  const isCurrent = month === currentMonthKey();
  const previous = (delta: number) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const date = new Date(year, monthNumber - 1 + delta, 1, 12, 0, 0, 0);
    onChange(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
  };

  if (variant === "large") {
    return (
      <div className="month-heading">
        <div className="month-heading-row">
          <button
            type="button"
            className="icon-button icon-button--quiet"
            onClick={() => previous(-1)}
            aria-label="Mese precedente"
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <div className="month-heading-label" aria-live="polite">
            <h1 className="month-heading-name">
              {capitalize(monthName(month))}
            </h1>
            <span className="month-heading-year">{monthYear(month)}</span>
          </div>
          <button
            type="button"
            className="icon-button icon-button--quiet"
            onClick={() => previous(1)}
            aria-label="Mese successivo"
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
        {!isCurrent ? (
          <button
            type="button"
            className="month-return"
            onClick={() => onChange(currentMonthKey())}
          >
            Torna a oggi
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="month-nav">
      <button
        type="button"
        className="icon-button icon-button--quiet"
        onClick={() => previous(-1)}
        aria-label="Mese precedente"
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <div className="month-nav-label" aria-live="polite">
        <span className="month-nav-name">{capitalize(monthName(month))}</span>
        <span className="month-nav-year">{monthYear(month)}</span>
      </div>
      <button
        type="button"
        className="icon-button icon-button--quiet"
        onClick={() => previous(1)}
        aria-label="Mese successivo"
      >
        <Icon name="chevronRight" size={18} />
      </button>
      {!isCurrent ? (
        <button
          type="button"
          className="month-return month-return--inline"
          onClick={() => onChange(currentMonthKey())}
        >
          Oggi
        </button>
      ) : null}
    </div>
  );
}
