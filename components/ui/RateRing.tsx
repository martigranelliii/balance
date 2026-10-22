import { formatPercent } from "@/lib/money";

interface RateRingProps {
  rate: number;
  label: string;
}

export function RateRing({ rate, label }: RateRingProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const visual = Math.min(1, Math.max(0, rate));
  const dash = circumference * visual;

  return (
    <div className="rate-ring">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${label}: ${formatPercent(rate, 1)}`}
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--mist)"
          strokeWidth="7"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--deep)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="rate-ring-value">{formatPercent(rate, 0)}</span>
    </div>
  );
}
