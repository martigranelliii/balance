import type { ReactNode } from "react";
import type { IconName } from "@/lib/categories";
import { Icon } from "./Icon";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? " empty-state--compact" : ""}`}>
      <span className="empty-state-icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="empty-state-copy">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
