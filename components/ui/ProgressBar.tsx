interface ProgressBarProps {
  value: number;
  over?: boolean;
  label: string;
  valueText?: string;
  tone?: "blue" | "warm" | "ink";
}

export function ProgressBar({
  value,
  over = false,
  label,
  valueText,
  tone = "blue",
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={`progress-track progress-track--${tone}${over ? " is-over" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={valueText}
    >
      <span className="progress-fill" style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
