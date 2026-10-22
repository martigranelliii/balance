"use client";

import { useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";

interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
  requireTyping?: string;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = false,
  requireTyping,
}: ConfirmDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const canConfirm = !requireTyping || confirmation.trim() === requireTyping;

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="confirm-body">
        <div className="confirm-icon" aria-hidden="true">
          {destructive ? "!" : "?"}
        </div>
        <div className="confirm-copy">{body}</div>
        {requireTyping ? (
          <label className="field">
            <span className="field-label">
              Scrivi <strong>{requireTyping}</strong> per confermare
            </span>
            <input
              className="text-input"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              data-autofocus
            />
          </label>
        ) : null}
      </div>
      <div className="sheet-actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Annulla
        </button>
        <button
          type="button"
          className={`button ${destructive ? "button--danger" : "button--primary"}`}
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
