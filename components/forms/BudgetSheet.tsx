"use client";

import { useState, type FormEvent } from "react";
import type { MonthlyBudget } from "@/lib/types";
import {
  categoriesForType,
  getCategoryLabel,
  type CategoryCatalog,
} from "@/lib/categories";
import {
  formatAmountInput,
  formatMoney,
  parseAmountToCents,
} from "@/lib/money";
import { monthTitle } from "@/lib/dates";
import { Sheet } from "../ui/Sheet";
import { Icon } from "../ui/Icon";
import { CategoryIcon } from "../ui/CategoryIcon";

interface BudgetSheetProps {
  month: string;
  budget?: MonthlyBudget;
  expenseByCategory: Record<string, number>;
  catalog?: CategoryCatalog;
  onSave: (categories: Record<string, number>) => void;
  onClose: () => void;
}

export function BudgetSheet({
  month,
  budget,
  expenseByCategory,
  catalog,
  onSave,
  onClose,
}: BudgetSheetProps) {
  const activeCategories = categoriesForType("expense", catalog);
  const activeIds = new Set(activeCategories.map((category) => category.id));
  const preservedCategories = (catalog ?? []).filter(
    (category) =>
      category.kind === "expense" &&
      !activeIds.has(category.id) &&
      (budget?.categories[category.id] ?? 0) > 0,
  );
  const categoryList = [...activeCategories, ...preservedCategories];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const category of categoryList) {
      const cents = budget?.categories[category.id];
      initial[category.id] = cents ? formatAmountInput(cents) : "";
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  const parsed = categoryList.map((category) => {
    const raw = values[category.id]?.trim() ?? "";
    const cents = raw ? parseAmountToCents(raw) : 0;
    return { category, raw, cents };
  });

  const totalCents = parsed.reduce(
    (total, item) => total + (item.cents && item.cents > 0 ? item.cents : 0),
    0,
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const categories: Record<string, number> = {};
    for (const item of parsed) {
      if (!item.raw) continue;
      if (item.cents === null || item.cents < 0) {
        setError(
          `Controlla l’importo di ${getCategoryLabel(
            item.category.id,
            "expense",
            catalog,
          )}.`,
        );
        return;
      }
      if (item.cents > 0) categories[item.category.id] = item.cents;
    }
    try {
      onSave(categories);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Non è stato possibile salvare il budget.",
      );
    }
  }

  return (
    <Sheet
      title={`Budget di ${monthTitle(month).toLowerCase()}`}
      subtitle="Scegli un importo per le categorie che vuoi seguire. Le altre restano libere."
      onClose={onClose}
    >
      <form className="budget-form" onSubmit={handleSubmit}>
        <div className="budget-form-list">
          {parsed.map((item, index) => (
            <label key={item.category.id} className="budget-form-row">
              <span className="budget-form-category">
                <CategoryIcon
                  categoryId={item.category.id}
                  kind="expense"
                  size="sm"
                  catalog={catalog}
                />
                <span>
                  <strong>{item.category.label}</strong>
                  <small>
                    Speso {formatMoney(expenseByCategory[item.category.id] ?? 0)}
                  </small>
                </span>
              </span>
              <span className="budget-input-wrap">
                <span aria-hidden="true">€</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[item.category.id] ?? ""}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      [item.category.id]: event.target.value,
                    }));
                    setError(null);
                  }}
                  placeholder="—"
                  aria-label={`Budget per ${item.category.label}`}
                  autoComplete="off"
                  data-autofocus={index === 0 ? "true" : undefined}
                />
              </span>
            </label>
          ))}
        </div>

        <div className="budget-form-total">
          <span>Budget totale</span>
          <strong>{formatMoney(totalCents)}</strong>
        </div>

        <p className="form-footnote">
          Lascia vuota una categoria per non darle un limite. Se svuoti tutte le
          categorie, il budget di {monthTitle(month).toLowerCase()} viene rimosso.
        </p>

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
          <button type="submit" className="button button--primary">
            Salva budget
          </button>
        </div>
      </form>
    </Sheet>
  );
}
