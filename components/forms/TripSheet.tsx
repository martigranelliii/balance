"use client";

import { useState, type FormEvent } from "react";
import type {
  BusinessTrip,
  BusinessTripExpenseCategory,
} from "@/lib/types";
import {
  BUSINESS_TRIP_EXPENSE_CATEGORIES,
  BUSINESS_TRIP_EXPENSE_LABELS,
  defaultSettlementMonth,
  formatKilometersInput,
  formatRateInput,
  formatRatePerKm,
  parseDecimalNumber,
  parseRateToMills,
} from "@/lib/trips";
import { formatAmountInput, formatMoney, parseAmountToCents } from "@/lib/money";
import { monthLabel, capitalize } from "@/lib/dates";
import { createId } from "@/lib/id";
import type {
  BusinessTripExpenseInput,
  BusinessTripInput,
} from "@/lib/store";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";

interface TripSheetProps {
  trip?: BusinessTrip;
  defaultDate: string;
  defaultRatePerKmMills: number;
  onSave: (input: BusinessTripInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

interface ExpenseDraft {
  key: string;
  id?: string;
  category: BusinessTripExpenseCategory;
  amount: string;
  description: string;
}

function newExpense(): ExpenseDraft {
  return {
    key: createId("draft"),
    category: "pranzo",
    amount: "",
    description: "",
  };
}

export function TripSheet({
  trip,
  defaultDate,
  defaultRatePerKmMills,
  onSave,
  onDelete,
  onClose,
}: TripSheetProps) {
  const editing = Boolean(trip);
  const initialDate = trip?.date ?? defaultDate;
  const initialRate = trip
    ? trip.ratePerKmMills
    : defaultRatePerKmMills > 0
      ? defaultRatePerKmMills
      : undefined;

  const [title, setTitle] = useState(trip?.title ?? "");
  const [date, setDate] = useState(initialDate);
  const [location, setLocation] = useState(trip?.location ?? "");
  const [expectedMonth, setExpectedMonth] = useState(
    trip?.expectedSettlementMonth ?? defaultSettlementMonth(initialDate),
  );
  const [settlementTouched, setSettlementTouched] = useState(Boolean(trip));
  const [expenses, setExpenses] = useState<ExpenseDraft[]>(
    trip?.expenses.map((expense) => ({
      key: expense.id,
      id: expense.id,
      category: expense.category,
      amount: formatAmountInput(expense.amountCents),
      description: expense.description ?? "",
    })) ?? [],
  );
  const [kilometers, setKilometers] = useState(
    formatKilometersInput(trip?.kilometers),
  );
  const [rate, setRate] = useState(
    initialRate !== undefined ? formatRateInput(initialRate) : "",
  );
  const [allowance, setAllowance] = useState(
    trip?.allowanceCents ? formatAmountInput(trip.allowanceCents) : "",
  );
  const [notes, setNotes] = useState(trip?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(trip?.notes));
  const [error, setError] = useState<string | null>(null);

  const expenseTotal = expenses.reduce((total, expense) => {
    const cents = parseAmountToCents(expense.amount);
    return total + (cents !== null && cents > 0 ? cents : 0);
  }, 0);
  const kilometersValue = parseDecimalNumber(kilometers);
  const rateMills = parseRateToMills(rate);
  const kmTotal =
    kilometersValue !== null &&
    kilometersValue > 0 &&
    rateMills !== null &&
    rateMills > 0
      ? Math.round((kilometersValue * rateMills) / 10)
      : 0;
  const allowanceCents = parseAmountToCents(allowance);
  const allowanceValue =
    allowanceCents !== null && allowanceCents > 0 ? allowanceCents : 0;
  const expectedTotal = expenseTotal + kmTotal + allowanceValue;

  function changeDate(nextDate: string) {
    setDate(nextDate);
    if (!settlementTouched && nextDate) {
      setExpectedMonth(defaultSettlementMonth(nextDate));
    }
  }

  function updateExpense(key: string, patch: Partial<ExpenseDraft>) {
    setExpenses((current) =>
      current.map((expense) =>
        expense.key === key ? { ...expense, ...patch } : expense,
      ),
    );
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Dai un titolo alla trasferta.");
      return;
    }
    if (!date) {
      setError("Scegli una data.");
      return;
    }

    const cleanExpenses: BusinessTripExpenseInput[] = [];
    for (const expense of expenses) {
      const cents = parseAmountToCents(expense.amount);
      if (cents === null || cents <= 0) {
        setError("Controlla gli importi delle spese.");
        return;
      }
      cleanExpenses.push({
        id: expense.id,
        category: expense.category,
        amountCents: cents,
        description: expense.description.trim() || undefined,
      });
    }

    const kmValue =
      kilometers.trim() === "" ? undefined : parseDecimalNumber(kilometers);
    if (
      kilometers.trim() !== "" &&
      (kmValue === null || kmValue === undefined || kmValue <= 0)
    ) {
      setError("Inserisci i chilometri percorsi, ad esempio 150.");
      return;
    }
    const rateValue =
      rate.trim() === "" ? undefined : parseRateToMills(rate);
    if (rate.trim() !== "" && rateValue === null) {
      setError("Inserisci una tariffa valida, ad esempio 0,488.");
      return;
    }
    if (kmValue && (!rateValue || rateValue <= 0)) {
      setError("Inserisci la tariffa per chilometro.");
      return;
    }

    const allowanceValueToSave =
      allowance.trim() === "" ? 0 : parseAmountToCents(allowance);
    if (allowanceValueToSave === null || allowanceValueToSave < 0) {
      setError("Controlla l’indennità.");
      return;
    }

    if (
      cleanExpenses.length === 0 &&
      !kmValue &&
      allowanceValueToSave === 0
    ) {
      setError("Aggiungi almeno una spesa, i chilometri o un’indennità.");
      return;
    }

    try {
      onSave({
        id: trip?.id,
        date,
        title: title.trim(),
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        expenses: cleanExpenses,
        kilometers: kmValue ?? undefined,
        ratePerKmMills: rateValue ?? undefined,
        allowanceCents: allowanceValueToSave || undefined,
        expectedSettlementMonth: expectedMonth,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Non è stato possibile salvare la trasferta.",
      );
    }
  }

  return (
    <Sheet
      title={editing ? "Modifica trasferta" : "Nuova trasferta"}
      subtitle="Le spese sono anticipate da te. Restano fuori dai movimenti del conto."
      onClose={onClose}
    >
      <form className="trip-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Titolo</span>
            <input
              type="text"
              className="text-input"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              placeholder="Es. Fiera a Bologna"
              maxLength={120}
              autoComplete="off"
              data-autofocus
            />
          </label>
          <label className="field">
            <span className="field-label">Località (facoltativa)</span>
            <input
              type="text"
              className="text-input"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Es. Bologna"
              maxLength={120}
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
                onChange={(event) => changeDate(event.target.value)}
                required
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Stipendio previsto</span>
            <input
              type="month"
              className="text-input"
              value={expectedMonth}
              onChange={(event) => {
                setExpectedMonth(event.target.value);
                setSettlementTouched(true);
              }}
              required
            />
            <span className="field-hint">
              {date
                ? `Di norma ${capitalize(monthLabel(defaultSettlementMonth(date)))}.`
                : "Calcolato dalla data della trasferta."}
            </span>
          </label>
        </div>

        <fieldset className="trip-expense-fieldset">
          <div className="trip-fieldset-head">
            <legend className="field-label">Spese sostenute</legend>
            <span className="trip-fieldset-total">{formatMoney(expenseTotal)}</span>
          </div>
          {expenses.length > 0 ? (
            <div className="trip-expense-list">
              {expenses.map((expense) => (
                <div className="trip-expense-row" key={expense.key}>
                  <label className="field">
                    <span className="field-label">Voce</span>
                    <select
                      className="select-input"
                      value={expense.category}
                      onChange={(event) =>
                        updateExpense(expense.key, {
                          category: event.target
                            .value as BusinessTripExpenseCategory,
                        })
                      }
                    >
                      {BUSINESS_TRIP_EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {BUSINESS_TRIP_EXPENSE_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Importo</span>
                    <span className="input-with-icon input-with-icon--money">
                      <span aria-hidden="true">€</span>
                      <input
                        type="text"
                        className="text-input"
                        inputMode="decimal"
                        value={expense.amount}
                        onChange={(event) =>
                          updateExpense(expense.key, {
                            amount: event.target.value,
                          })
                        }
                        placeholder="0,00"
                        autoComplete="off"
                      />
                    </span>
                  </label>
                  <label className="field trip-expense-description">
                    <span className="field-label">Nota (facoltativa)</span>
                    <input
                      type="text"
                      className="text-input"
                      value={expense.description}
                      onChange={(event) =>
                        updateExpense(expense.key, {
                          description: event.target.value,
                        })
                      }
                      placeholder="Es. Pranzo di lavoro"
                      maxLength={160}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button icon-button--quiet trip-expense-remove"
                    aria-label={`Rimuovi ${BUSINESS_TRIP_EXPENSE_LABELS[expense.category]}`}
                    onClick={() => {
                      setExpenses((current) =>
                        current.filter((item) => item.key !== expense.key),
                      );
                      setError(null);
                    }}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="trip-empty-expenses">
              Hotel, pasti, treni, pedaggi, parcheggi o altre spese anticipate.
            </p>
          )}
          <button
            type="button"
            className="disclosure-link"
            onClick={() => setExpenses((current) => [...current, newExpense()])}
          >
            <Icon name="plus" size={15} />
            Aggiungi spesa
          </button>
        </fieldset>

        <div className="trip-km-panel">
          <div className="trip-fieldset-head">
            <p className="field-label">Chilometri</p>
            <span className="trip-fieldset-total">{formatMoney(kmTotal)}</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Km percorsi</span>
              <input
                type="text"
                className="text-input"
                inputMode="decimal"
                value={kilometers}
                onChange={(event) => {
                  setKilometers(event.target.value);
                  setError(null);
                }}
                placeholder="Es. 150"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span className="field-label">Tariffa €/km</span>
              <span className="input-with-icon input-with-icon--money">
                <span aria-hidden="true">€</span>
                <input
                  type="text"
                  className="text-input"
                  inputMode="decimal"
                  value={rate}
                  onChange={(event) => {
                    setRate(event.target.value);
                    setError(null);
                  }}
                  placeholder="0,488"
                  autoComplete="off"
                />
              </span>
            </label>
          </div>
          {kilometersValue && rateMills ? (
            <p className="trip-km-note">
              {kilometersValue.toLocaleString("it-IT", {
                maximumFractionDigits: 3,
              })}{" "}
              km × {formatRatePerKm(rateMills)}/km
            </p>
          ) : null}
        </div>

        <label className="field trip-allowance-field">
          <span className="field-label">Indennità</span>
          <span className="input-with-icon input-with-icon--money">
            <span aria-hidden="true">€</span>
            <input
              type="text"
              className="text-input"
              inputMode="decimal"
              value={allowance}
              onChange={(event) => {
                setAllowance(event.target.value);
                setError(null);
              }}
              placeholder="0,00"
              autoComplete="off"
            />
          </span>
          <span className="field-hint">
            L’importo spettante per la trasferta, se previsto.
          </span>
        </label>

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

        <div className="trip-form-summary" aria-live="polite">
          <div>
            <span>Spese sostenute</span>
            <strong>{formatMoney(expenseTotal)}</strong>
          </div>
          <div>
            <span>Rimborso km</span>
            <strong>{formatMoney(kmTotal)}</strong>
          </div>
          <div>
            <span>Indennità</span>
            <strong>{formatMoney(allowanceValue)}</strong>
          </div>
          <div className="trip-form-summary-total">
            <span>Totale atteso</span>
            <strong>{formatMoney(expectedTotal)}</strong>
          </div>
        </div>

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
            {editing ? "Salva modifiche" : "Salva trasferta"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
