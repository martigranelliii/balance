"use client";

import { useState } from "react";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Icon } from "./Icon";

export interface NetWorthChartPoint {
  date: string;
  totalCents: number;
}

interface NetWorthChartProps {
  points: NetWorthChartPoint[];
}

/**
 * A small responsive SVG chart with an always-readable exact value readout.
 * The HTML dots keep a comfortable touch target on mobile while the SVG line
 * follows the available width.
 */
export function NetWorthChart({ points }: NetWorthChartProps) {
  const [activeIndex, setActiveIndex] = useState(points.length - 1);
  if (points.length === 0) return null;

  const index = Math.min(Math.max(activeIndex, 0), points.length - 1);
  const active = points[index];
  const values = points.map((point) => point.totalCents);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin;
  const padding = spread > 0 ? spread * 0.14 : Math.max(Math.abs(rawMax) * 0.06, 100);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;
  const top = 8;
  const bottom = 92;
  const left = 3;
  const right = 97;
  const xFor = (position: number) =>
    points.length === 1
      ? 50
      : left + (position / (points.length - 1)) * (right - left);
  const yFor = (value: number) =>
    bottom - ((value - min) / range) * (bottom - top);
  const coordinates = points.map((point, position) => ({
    x: xFor(position),
    y: yFor(point.totalCents),
  }));
  const linePoints = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = `${left},${bottom} ${linePoints} ${right},${bottom}`;
  const zeroY = min < 0 && max > 0 ? yFor(0) : null;

  return (
    <div className="networth-chart">
      <div className="networth-chart-readout" aria-live="polite">
        <span>
          <Icon name="camera" size={14} />
          {formatShortDate(active.date, true)}
        </span>
        <strong>{formatMoney(active.totalCents)}</strong>
      </div>

      <div className="networth-chart-frame">
        <div className="networth-chart-scale" aria-hidden="true">
          <span>{formatMoney(rawMax)}</span>
          <span>{formatMoney(Math.round((rawMax + rawMin) / 2))}</span>
          <span>{formatMoney(rawMin)}</span>
        </div>
        <div className="networth-chart-plot">
          <svg
            className="networth-chart-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Andamento del patrimonio in ${points.length} aggiornamenti, da ${formatShortDate(points[0].date, true)} a ${formatShortDate(points[points.length - 1].date, true)}`}
          >
            <defs>
              <linearGradient
                id="networth-chart-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <line
              className="networth-chart-grid"
              x1="0"
              x2="100"
              y1="8"
              y2="8"
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="networth-chart-grid"
              x1="0"
              x2="100"
              y1="50"
              y2="50"
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="networth-chart-grid"
              x1="0"
              x2="100"
              y1="92"
              y2="92"
              vectorEffect="non-scaling-stroke"
            />
            {zeroY !== null ? (
              <line
                className="networth-chart-zero"
                x1="0"
                x2="100"
                y1={zeroY}
                y2={zeroY}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <polygon points={areaPoints} fill="url(#networth-chart-fill)" />
            <polyline
              className="networth-chart-line"
              points={linePoints}
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="networth-chart-cursor"
              x1={coordinates[index].x}
              x2={coordinates[index].x}
              y1={top}
              y2={bottom}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {points.map((point, position) => (
            <button
              key={`${point.date}-${position}`}
              type="button"
              className={`networth-chart-point${
                position === index ? " networth-chart-point--active" : ""
              }`}
              style={{
                left: `${coordinates[position].x}%`,
                top: `${coordinates[position].y}%`,
              }}
              onPointerEnter={() => setActiveIndex(position)}
              onFocus={() => setActiveIndex(position)}
              onClick={() => setActiveIndex(position)}
              aria-label={`${formatShortDate(point.date, true)}: ${formatMoney(point.totalCents)}`}
            />
          ))}
        </div>
      </div>

      <div className="networth-chart-axis">
        <span>{formatShortDate(points[0].date, true)}</span>
        <span>{formatShortDate(points[points.length - 1].date, true)}</span>
      </div>
      <p className="networth-chart-hint">
        Tocca o passa sui punti per leggere il valore esatto.
      </p>
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.date}>
            {formatShortDate(point.date, true)}: {formatMoney(point.totalCents)}
          </li>
        ))}
      </ul>
    </div>
  );
}
