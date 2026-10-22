"use client";

import { useState, type FormEvent } from "react";
import type { PersonalBalanceDirection, PersonalBalanceItem } from "@/lib/types";
import { formatAmountInput, parseAmountToCents } from "@/lib/money";
import type { PersonalBalanceInput } from "@/lib/store";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";

interface PersonalItemSheetProps {
  item?: PersonalBalanceItem;
  defaultDate: string;
  onSave: (input: PersonalBalanceInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const DIRECTIONS: { value: PersonalBalanceDirection; label: string }[] = [
  { value: "receivable", label: "Da ricevere" },
  { value: "payable", label: "Da dare" },
];

export function PersonalItemSheet({
  item,
  defaultDate,
  onSave,
  onDelete,
  onClose,
}: PersonalItemSheetProps) {
  const editing = Boolean(item);
  const [direction, setDirection] = useState<PersonalBalanceDirection>(
    item?.direction ?? "receivable",
  );
  const [person, setPerson] = useState(item?.person ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(
    item ? formatAmountInput(item.amountCents) : "",
  );
  const [date, setDate] = useState(item?.date ?? defaultDate);
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(item?.notes));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!person.trim()) {
      setError("Indica a chi si riferisce la voce.");
      return;
    }
    if (!description.trim()) {
      setError("Aggiungi una descrizione, ad esempio “Regalo”.");
      return;
    }
    const cents = parseAmountToCents(amount);
    if (cents === null || cents <= 0) {
      setError("Inserisci un importo maggiore di zero, ad esempio 36,68.");
      return;
    }
    if (!date) {
      setError("Scegli una data.");
      return;
    }

    try {
      onSave({
        id: item?.id,
        direction,
        person: person.trim(),
        description: description.trim(),
        amountCents: cents,
        date,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Non è stato possibile salvare la voce.",
      );
    }
  }

  return (
    <Sheet
      title={editing ? "Modifica voce" : "Nuova voce"}
      subtitle="Un promemoria personale. Non entra in entrate, spese o saldo dei conti."
      onClose={onClose}
    >
      <form className="personal-form" onSubmit={handleSubmit}>
        <div
          className="segmented segmented--type"
          role="group"
          aria-label="Direzione della voce"
        >
          {DIRECTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`segmented-item${direction === option.value ? " is-active" : ""}`}
              aria-pressed={direction === option.value}
              onClick={() => {
                setDirection(option.value);
                setError(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="amount-field">
          <span className="field-label">Importo</span>
          <span className="amount-input-wrap">
            <span className="amount-currency" aria-hidden="true">
              €
            </span>
            <input
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              placeholder="0,00"
              autoComplete="off"
              aria-label="Importo in euro"
              data-autofocus
            />
          </span>
        </label>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Persona</span>
            <input
              type="text"
              className="text-input"
              value={person}
              onChange={(event) => {
                setPerson(event.target.value);
                setError(null);
              }}
              placeholder="Es. Papà"
              maxLength={120}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field-label">Descrizione</span>
            <input
              type="text"
              className="text-input"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setError(null);
              }}
              placeholder="Es. Regalo"
              maxLength={280}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Data</span>
            <span className="input-with-icon">
              <Icon name="calendar" size={16} />
              <input
                type="date"
                className="text-input"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Scadenza (facoltativa)</span>
            <span className="input-with-icon">
              <Icon name="calendar" size={16} />
              <input
                type="date"
                className="text-input"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </span>
          </label>
        </div>

        {!showNotes ? (
          <button
            type="button"
            className="disclosure-link"
            onClick={() => setShowNotes(true)}
          >
            <Icon name="plus" size={15} />
            Aggiungi una nota
          </button>
        ) : (
          <label className="field">
            <span className="field-label">Nota (facoltativa)</span>
            <textarea
              className="text-input text-area"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Un contesto, se ti serve più avanti."
            />
          </label>
        )}

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
            {editing ? "Salva modifiche" : "Salva voce"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
