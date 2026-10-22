"use client";

import { useId } from "react";

interface SparklineProps {
  values: number[];
  label: string;
  className?: string;
}

export function Sparkline({ values, label, className }: SparklineProps) {
  const gradientId = useId().replace(/:/g, "");
  if (values.length < 2) return null;

  const width = 160;
  const height = 44;
  const padding = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y =
      padding + (1 - (value - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${points[0].x},${height} ${line} ${points.at(-1)?.x ?? 0},${height}`;
  const last = points.at(-1);

  return (
    <svg
      className={`sparkline${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sky)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--sky)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--deep)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last ? (
        <circle
          cx={last.x}
          cy={last.y}
          r="2.4"
          fill="var(--paper)"
          stroke="var(--deep)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
