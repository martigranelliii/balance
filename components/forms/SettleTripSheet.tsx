"use client";

import { useState } from "react";
import type { BusinessTrip, Transaction } from "@/lib/types";
import { businessTripTotals } from "@/lib/trips";
import {
  getCategoryLabel,
  type CategoryCatalog,
} from "@/lib/categories";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";

interface SettleTripSheetProps {
  trip: BusinessTrip;
  transactions: Transaction[];
  catalog?: CategoryCatalog;
  onSettle: (linkedSalaryTransactionId?: string) => void;
  onClose: () => void;
}

export function SettleTripSheet({
  trip,
  transactions,
  catalog,
  onSettle,
  onClose,
}: SettleTripSheetProps) {
  const [linkedId, setLinkedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const totals = businessTripTotals(trip);
  const incomeTransactions = transactions
    .filter((transaction) => transaction.type === "income")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  function settle() {
    try {
      onSettle(linkedId || undefined);
    } catch (settleError) {
      setError(
        settleError instanceof Error
          ? settleError.message
          : "Non è stato possibile segnare la trasferta come rimborsata.",
      );
    }
  }

  return (
    <Sheet
      title="Trasferta rimborsata"
      subtitle="Lo stipendio reale resta il movimento bancario che hai già registrato."
      onClose={onClose}
    >
      <div className="trip-settle-summary">
        <div>
          <span>{trip.title}</span>
          <strong>{formatMoney(totals.totalCents)}</strong>
        </div>
        <p>
          Segnare la trasferta come rimborsata non crea una seconda entrata e
          non modifica lo stipendio.
        </p>
      </div>

      <label className="field">
        <span className="field-label">Collega a uno stipendio (facoltativo)</span>
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
          {incomeTransactions.map((transaction) => (
            <option key={transaction.id} value={transaction.id}>
              {formatShortDate(transaction.date, true)} ·{" "}
              {transaction.description ||
                getCategoryLabel(transaction.category, "income", catalog)}{" "}
              · {formatMoney(transaction.amountCents)}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {incomeTransactions.length > 0
            ? "Puoi collegare la trasferta a un movimento in entrata già esistente."
            : "Non ci sono movimenti in entrata da collegare. Puoi comunque segnarla come rimborsata."}
        </span>
      </label>

      {linkedId ? (
        <p className="inline-note">
          <Icon name="info" size={15} />
          Il collegamento serve solo come promemoria. Non cambia l’importo dello
          stipendio né i totali del mese.
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          <Icon name="info" size={15} />
          {error}
        </p>
      ) : null}

      <div className="sheet-actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Annulla
        </button>
        <button type="button" className="button button--primary" onClick={settle}>
          Segna rimborsata
        </button>
      </div>
    </Sheet>
  );
}
