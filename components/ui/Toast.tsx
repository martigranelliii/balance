"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 2800);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" size={16} />
      <span>{message}</span>
    </div>
  );
}
