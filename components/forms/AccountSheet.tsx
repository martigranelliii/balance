"use client";

import { useState, type FormEvent } from "react";
import type { Account, AccountType } from "@/lib/types";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_ICONS,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/categories";
import { formatAmountInput, parseAmountToCents } from "@/lib/money";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";

interface AccountSheetProps {
  account?: Account;
  onSave: (input: {
    id?: string;
    name: string;
    type: AccountType;
    currentBalanceCents: number;
    includeInNetWorth: boolean;
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function AccountSheet({
  account,
  onSave,
  onDelete,
  onClose,
}: AccountSheetProps) {
  const editing = Boolean(account);
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");
  const [balance, setBalance] = useState(
    account ? formatAmountInput(account.currentBalanceCents) : "",
  );
  const [includeInNetWorth, setIncludeInNetWorth] = useState(
    account?.includeInNetWorth ?? true,
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Dai un nome al conto, ad esempio “Conto principale”.");
      return;
    }
    const cents = balance.trim() ? parseAmountToCents(balance) : 0;
    if (cents === null) {
      setError("Inserisci un saldo valido, ad esempio 1.250,00.");
      return;
    }
    try {
      onSave({
        id: account?.id,
        name: name.trim(),
        type,
        currentBalanceCents: cents,
        includeInNetWorth,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Non è stato possibile salvare il conto.",
      );
    }
  }

  return (
    <Sheet
      title={editing ? "Modifica conto" : "Nuovo conto"}
      subtitle="Il saldo lo aggiorni tu. Balance non si collega alla banca."
      onClose={onClose}
    >
      <form className="account-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Nome del conto</span>
          <input
            type="text"
            className="text-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="Es. Conto principale"
            maxLength={80}
            autoComplete="off"
            data-autofocus
          />
        </label>

        <fieldset className="category-fieldset">
          <legend className="field-label">Tipo di conto</legend>
          <div className="account-type-grid">
            {ACCOUNT_TYPES.map((accountType) => (
              <button
                key={accountType}
                type="button"
                className={`account-type-choice${type === accountType ? " is-selected" : ""}`}
                onClick={() => setType(accountType)}
                aria-pressed={type === accountType}
              >
                <Icon name={ACCOUNT_TYPE_ICONS[accountType]} size={19} />
                <span>{ACCOUNT_TYPE_LABELS[accountType]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="amount-field amount-field--account">
          <span className="field-label">Saldo attuale</span>
          <span className="amount-input-wrap">
            <span className="amount-currency" aria-hidden="true">
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              value={balance}
              onChange={(event) => {
                setBalance(event.target.value);
                setError(null);
              }}
              placeholder="0,00"
              aria-label="Saldo attuale in euro"
              autoComplete="off"
            />
          </span>
          <span className="field-hint">
            Puoi usare il segno meno se il saldo è in rosso.
          </span>
        </label>

        <label className="toggle-row">
          <span className="toggle-copy">
            <strong>Includi nel patrimonio</strong>
            <span>
              Se lo escludi, il conto resta visibile ma non entra nel totale.
            </span>
          </span>
          <input
            type="checkbox"
            className="switch-input"
            checked={includeInNetWorth}
            onChange={(event) => setIncludeInNetWorth(event.target.checked)}
          />
          <span className="switch" aria-hidden="true" />
        </label>

        <p className="form-footnote">
          <Icon name="camera" size={14} />
          Quando aggiorni il saldo, Balance salva una fotografia datata del
          patrimonio. Una sola per giorno.
        </p>

        {error ? (
          <p className="form-error" role="alert">
            <Icon name="info" size={15} />
            {error}
          </p>
        ) : null}

        <div className="sheet-actions">
          {editing && onDelete ? (
            <button
              type="button"
              className="button button--danger-ghost button--small"
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
              Elimina
            </button>
          ) : (
            <button type="button" className="button button--ghost" onClick={onClose}>
              Annulla
            </button>
          )}
          <button type="submit" className="button button--primary">
            {editing ? "Salva conto" : "Aggiungi conto"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
