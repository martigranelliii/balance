"use client";

import { useState } from "react";
import type { PersonalBalanceItem, Transaction } from "@/lib/types";
import {
  getCategoryLabel,
  type CategoryCatalog,
} from "@/lib/categories";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";

interface SettlePersonalItemSheetProps {
  item: PersonalBalanceItem;
  transactions: Transaction[];
  catalog?: CategoryCatalog;
  onSettle: (linkedTransactionId?: string) => void;
  onClose: () => void;
}

function transactionLabel(
  transaction: Transaction,
  catalog?: CategoryCatalog,
): string {
  const description =
    transaction.description ||
    (transaction.type === "transfer"
      ? "Trasferimento"
      : getCategoryLabel(
          transaction.category,
          transaction.type === "income" ? "income" : "expense",
          catalog,
        ));
  return `${formatShortDate(transaction.date, true)} · ${description} · ${formatMoney(
    transaction.amountCents,
  )}`;
}

export function SettlePersonalItemSheet({
  item,
  transactions,
  catalog,
  onSettle,
  onClose,
}: SettlePersonalItemSheetProps) {
  const [linkedId, setLinkedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sorted = [...transactions].sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );

  function settle(withLink: boolean) {
    try {
      onSettle(withLink && linkedId ? linkedId : undefined);
    } catch (settleError) {
      setError(
        settleError instanceof Error
          ? settleError.message
          : "Non è stato possibile segnare la voce come saldata.",
      );
    }
  }

  return (
    <Sheet
      title={item.direction === "receivable" ? "Segna come ricevuto" : "Segna come pagato"}
      subtitle="Nessun movimento viene creato automaticamente."
      onClose={onClose}
    >
      <div className="personal-settle-summary">
        <div>
          <span>
            {item.person} · {item.description}
          </span>
          <strong>{formatMoney(item.amountCents)}</strong>
        </div>
        <p>
          Vuoi collegare questa voce a un movimento bancario già esistente?
        </p>
      </div>

      <label className="field">
        <span className="field-label">Movimento esistente (facoltativo)</span>
        <select
          className="select-input"
          value={linkedId}
          onChange={(event) => {
            setLinkedId(event.target.value);
            setError(null);
          }}
          data-autofocus
        >
          <option value="">Nessun collegamento</option>
          {sorted.map((transaction) => (
            <option key={transaction.id} value={transaction.id}>
              {transactionLabel(transaction, catalog)}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {sorted.length > 0
            ? "Il collegamento resta come riferimento e non modifica il movimento."
            : "Non ci sono movimenti da collegare. Puoi saldare senza collegamento."}
        </span>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          <Icon name="info" size={15} />
          {error}
        </p>
      ) : null}

      <div className="sheet-actions settle-actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Annulla
        </button>
        <button
          type="button"
          className="button button--soft"
          onClick={() => settle(false)}
        >
          Salda senza collegamento
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => settle(true)}
          disabled={!linkedId}
        >
          Collega e salda
        </button>
      </div>
    </Sheet>
  );
}
