"use client";

import { useState, type FormEvent } from "react";
import type { BalanceData } from "@/lib/types";
import {
  createCategoryCatalog,
  findCategoryByName,
  type CategoryDefinition,
  type CategoryKind,
} from "@/lib/categories";
import {
  addCustomCategory,
  archiveCustomCategory,
  hideDefaultCategory,
  renameCustomCategory,
  restoreCustomCategory,
  restoreDefaultCategory,
} from "@/lib/store";
import { CategoryIcon } from "./ui/CategoryIcon";
import { Icon } from "./ui/Icon";

interface CategorySettingsProps {
  data: BalanceData;
  onToast: (message: string) => void;
}

const GROUPS: { kind: CategoryKind; title: string; eyebrow: string }[] = [
  { kind: "income", title: "Entrate", eyebrow: "Entrate" },
  { kind: "expense", title: "Spese", eyebrow: "Spese" },
];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Non è stato possibile aggiornare le categorie.";
}

export function CategorySettings({ data, onToast }: CategorySettingsProps) {
  const catalog = createCategoryCatalog(data);
  const [addType, setAddType] = useState<CategoryKind | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inactive = catalog.filter(
    (category) => category.hidden || category.archived,
  );
  const addConflict = addType
    ? findCategoryByName(newName, addType, catalog)
    : undefined;
  const addConflictRestorable = Boolean(
    addConflict && (addConflict.hidden || addConflict.archived),
  );

  function resetAdd() {
    setAddType(null);
    setNewName("");
    setError(null);
  }

  function startAdd(kind: CategoryKind) {
    setAddType(kind);
    setNewName("");
    setEditingId(null);
    setError(null);
  }

  function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!addType) return;
    if (addConflict) {
      setError(
        addConflictRestorable
          ? "Questa categoria esiste già. Puoi ripristinarla qui sopra."
          : "Esiste già una categoria con questo nome.",
      );
      return;
    }
    try {
      addCustomCategory({ name: newName, type: addType });
      onToast("Categoria aggiunta.");
      resetAdd();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function startRename(category: CategoryDefinition) {
    setEditingId(category.id);
    setEditingName(category.label);
    setAddType(null);
    setError(null);
  }

  function saveRename(event: FormEvent, category: CategoryDefinition) {
    event.preventDefault();
    try {
      renameCustomCategory(category.id, editingName);
      onToast("Categoria rinominata.");
      setEditingId(null);
      setEditingName("");
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function hideCategory(category: CategoryDefinition) {
    try {
      hideDefaultCategory(category.id);
      onToast("Categoria nascosta. I movimenti storici restano invariati.");
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function deleteCategory(category: CategoryDefinition) {
    try {
      archiveCustomCategory(category.id);
      onToast(
        "Categoria eliminata. I movimenti storici restano invariati.",
      );
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function restoreCategory(category: CategoryDefinition) {
    try {
      if (category.custom) {
        restoreCustomCategory(category.id);
      } else {
        restoreDefaultCategory(category.id);
      }
      onToast("Categoria ripristinata.");
      setError(null);
      if (addType) resetAdd();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="category-settings">
      <div className="category-settings-intro">
        <p>
          Le categorie predefinite restano sempre disponibili nello storico.
          Nasconderle o eliminarle non cambia i movimenti già registrati.
        </p>
      </div>

      {GROUPS.map((group) => {
        const active = catalog.filter(
          (category) =>
            category.kind === group.kind &&
            !category.hidden &&
            !category.archived,
        );

        return (
          <div key={group.kind} className="category-settings-group">
            <p className="eyebrow">{group.eyebrow}</p>
            <ul className="category-manager-list">
              {active.map((category) => (
                <li key={category.id} className="category-manager-row">
                  {editingId === category.id ? (
                    <form
                      className="category-rename-form"
                      onSubmit={(event) => saveRename(event, category)}
                    >
                      <input
                        className="text-input"
                        value={editingName}
                        onChange={(event) => {
                          setEditingName(event.target.value);
                          setError(null);
                        }}
                        maxLength={60}
                        aria-label={`Nuovo nome per ${category.label}`}
                        autoFocus
                      />
                      <button type="submit" className="button button--primary button--small">
                        Salva
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          setEditingId(null);
                          setEditingName("");
                          setError(null);
                        }}
                      >
                        Annulla
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="category-manager-name">
                        <CategoryIcon
                          categoryId={category.id}
                          kind={group.kind}
                          size="sm"
                          catalog={catalog}
                        />
                        <span>
                          <strong>{category.label}</strong>
                          <small>
                            {category.custom
                              ? "Personalizzata"
                              : "Predefinita"}
                          </small>
                        </span>
                      </span>
                      <span className="category-manager-actions">
                        {category.custom ? (
                          <>
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => startRename(category)}
                            >
                              Rinomina
                            </button>
                            <button
                              type="button"
                              className="text-link text-link--danger"
                              onClick={() => deleteCategory(category)}
                            >
                              Elimina
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => hideCategory(category)}
                          >
                            Nascondi
                          </button>
                        )}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {addType === group.kind ? (
              <form className="category-add-form" onSubmit={addCategory}>
                <input
                  className="text-input"
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    setError(null);
                  }}
                  placeholder={
                    group.kind === "income"
                      ? "Es. Ripetizioni"
                      : "Es. Psicologo"
                  }
                  maxLength={60}
                  aria-label={`Nome della nuova categoria di ${group.title.toLowerCase()}`}
                  autoFocus
                />
                <button
                  type="submit"
                  className="button button--primary button--small"
                  disabled={!newName.trim()}
                >
                  Aggiungi
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={resetAdd}
                >
                  Annulla
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="category-add-button"
                onClick={() => startAdd(group.kind)}
              >
                <Icon name="plus" size={16} />
                Aggiungi categoria
              </button>
            )}

            {addType === group.kind && addConflict ? (
              <div className="category-conflict" role="status">
                <p>
                  {addConflictRestorable
                    ? "Questa categoria esiste già. Vuoi ripristinarla?"
                    : "Esiste già una categoria con questo nome."}
                </p>
                {addConflictRestorable ? (
                  <button
                    type="button"
                    className="button button--soft button--small"
                    onClick={() => restoreCategory(addConflict)}
                  >
                    Ripristina
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="category-settings-group category-settings-inactive">
        <p className="eyebrow">Categorie non utilizzate</p>
        {inactive.length === 0 ? (
          <p className="category-settings-empty">
            Nascondi una categoria predefinita o elimina una categoria
            personalizzata: comparirà qui e potrai ripristinarla.
          </p>
        ) : (
          <ul className="category-manager-list">
            {inactive.map((category) => (
              <li key={category.id} className="category-manager-row">
                <span className="category-manager-name">
                  <CategoryIcon
                    categoryId={category.id}
                    kind={category.kind}
                    size="sm"
                    catalog={catalog}
                  />
                  <span>
                    <strong>{category.label}</strong>
                    <small>
                      {category.kind === "income" ? "Entrate" : "Spese"} ·{" "}
                      {category.archived ? "Eliminata" : "Nascosta"}
                    </small>
                  </span>
                </span>
                <span className="category-manager-actions">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => restoreCategory(category)}
                  >
                    Ripristina
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          <Icon name="info" size={15} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
