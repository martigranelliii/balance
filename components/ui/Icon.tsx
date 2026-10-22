import type { ReactNode } from "react";
import type { IconName } from "@/lib/categories";

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.7,
  className,
  label,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {paths[name]}
    </svg>
  );
}

const dot = (
  <>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </>
);

const paths: Record<IconName, ReactNode> = {
  food: (
    <>
      <path d="M7 3v8" />
      <path d="M4.5 3v4a2.5 2.5 0 0 0 5 0V3" />
      <path d="M7 11v10" />
      <path d="M16.5 3c1.7 2.8 1.7 5.2 0 8v10" />
    </>
  ),
  transport: (
    <>
      <rect x="5" y="3" width="14" height="14" rx="2.5" />
      <path d="M5 8h14" />
      <path d="M8 17v2M16 17v2" />
      <circle cx="8.5" cy="13.5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="13.5" r=".7" fill="currentColor" stroke="none" />
      <path d="M8 3V2M16 3V2" />
    </>
  ),
  clothing: (
    <>
      <path d="M12 8a2 2 0 1 0-2-2" />
      <path d="M12 8v2.2L3.6 15a1.4 1.4 0 0 0 .7 2.6h15.4a1.4 1.4 0 0 0 .7-2.6L12 10.2Z" />
    </>
  ),
  travel: (
    <path d="M3 13.5 21 5l-4.2 7.2.8 5.8-2.4.7-1.8-4.2-4 2.3-.7 2.2-1.7.5.5-3.4L3 13.5Z" />
  ),
  fuel: (
    <>
      <path d="M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
      <path d="M4 21h12" />
      <path d="M7 7h5" />
      <path d="M14 8h2.5a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2-2" />
    </>
  ),
  beauty: (
    <>
      <path d="M12 3c.6 3.4 2.6 5.4 6 6-3.4.6-5.4 2.6-6 6-.6-3.4-2.6-5.4-6-6 3.4-.6 5.4-2.6 6-6Z" />
      <path d="M18.5 15.5c.3 1.5 1.2 2.4 2.7 2.7-1.5.3-2.4 1.2-2.7 2.7-.3-1.5-1.2-2.4-2.7-2.7 1.5-.3 2.4-1.2 2.7-2.7Z" />
    </>
  ),
  health: (
    <>
      <path d="M20.5 5.5a5 5 0 0 0-7.1 0L12 6.9l-1.4-1.4a5 5 0 0 0-7.1 7.1L12 21l8.5-8.4a5 5 0 0 0 0-7.1Z" />
      <path d="M6.5 12h3.2l1.3-2.6 2.1 5.2 1.4-2.6h3" />
    </>
  ),
  dots: dot,
  salary: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
      <path d="M3 12h18" />
      <path d="M10 12v2h4v-2" />
    </>
  ),
  refund: (
    <>
      <path d="M4 10h10a5 5 0 0 1 0 10h-3" />
      <path d="m8 6-4 4 4 4" />
    </>
  ),
  tag: (
    <>
      <path d="M3 11.5V4.5A1.5 1.5 0 0 1 4.5 3h7l9 9-8 8-9-8.5Z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 0 4 21.5v-17Z" />
      <path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H13v17h5.5A1.5 1.5 0 0 1 20 21.5v-17Z" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 8h15" />
      <path d="m15 4 4 4-4 4" />
      <path d="M20 16H5" />
      <path d="m9 12-4 4 4 4" />
    </>
  ),
  bank: (
    <>
      <path d="m3 9 9-5 9 5" />
      <path d="M4 9h16" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
      <path d="M3 20h18" />
    </>
  ),
  savings: (
    <>
      <path d="M4 10a8 8 0 1 1 16 0v4a2 2 0 0 1-2 2h-1l-1 3h-3l-.5-3h-3L9 19H6l-1-3H4a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z" />
      <path d="M16 10h.01" />
      <path d="M9 5.5V4a2 2 0 0 1 3.5-1.3" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01M18 15v.01" />
    </>
  ),
  investment: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 4-5 3 3 5-7" />
      <path d="M15 6h4v4" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v2" />
      <path d="M4 6.5V18a2 2 0 0 0 2 2h14V8H6.5A2.5 2.5 0 0 1 4 6.5Z" />
      <path d="M16 13h3" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  budget: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M3 12h18" />
      <path d="M10 12v2h4v-2" />
    </>
  ),
  insights: (
    <>
      <path d="M3 20h18" />
      <path d="M6 16v-4M11 16V7M16 16v-6M21 16V4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h7M15 7h5M4 17h5M13 17h7" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="11" cy="17" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  chevronLeft: <path d="m14.5 5-7 7 7 7" />,
  chevronRight: <path d="m9.5 5 7 7-7 7" />,
  arrowUp: (
    <>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </>
  ),
  filter: <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v3" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="m15 8 4 4-4 4" />
      <path d="M19 12H9" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  edit: (
    <>
      <path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m14.5 5.5 4 4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 8Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
};
