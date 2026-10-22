import type {
  AccountType,
  BalanceData,
  CustomCategory,
  TransactionType,
} from "./types";

export type IconName =
  | "food"
  | "transport"
  | "clothing"
  | "travel"
  | "fuel"
  | "health"
  | "beauty"
  | "dots"
  | "salary"
  | "refund"
  | "tag"
  | "book"
  | "transfer"
  | "bank"
  | "savings"
  | "cash"
  | "investment"
  | "wallet"
  | "other"
  | "sun"
  | "list"
  | "budget"
  | "layers"
  | "briefcase"
  | "insights"
  | "settings"
  | "plus"
  | "minus"
  | "chevronLeft"
  | "chevronRight"
  | "arrowUp"
  | "arrowDown"
  | "arrowRight"
  | "close"
  | "search"
  | "filter"
  | "trash"
  | "download"
  | "upload"
  | "lock"
  | "logout"
  | "calendar"
  | "check"
  | "edit"
  | "camera"
  | "info";

export type CategoryKind = "income" | "expense";

export interface CategoryDefinition {
  id: string;
  label: string;
  kind: CategoryKind;
  icon: IconName;
  /** Optional short label for tight chips. */
  shortLabel?: string;
  /** True for categories created by the user. */
  custom?: boolean;
  /** Default category hidden by this user: kept for history, not proposed. */
  hidden?: boolean;
  /** User category removed from the picker: kept for history, not proposed. */
  archived?: boolean;
}

export type CategoryCatalog = CategoryDefinition[];

/**
 * The app-wide default set. These ids are never rewritten or removed: hiding a
 * default category only records a preference, so historical transactions keep
 * their original id and label.
 */
export const CATEGORIES: CategoryDefinition[] = [
  { id: "stipendio", label: "Stipendio", kind: "income", icon: "salary" },
  { id: "rimborsi", label: "Rimborsi", kind: "income", icon: "refund" },
  { id: "vinted", label: "Vinted", kind: "income", icon: "tag" },
  {
    id: "tutorato",
    label: "Tutorato / Ripetizioni",
    kind: "income",
    icon: "book",
    shortLabel: "Tutorato",
  },
  { id: "altro-entrata", label: "Altro", kind: "income", icon: "dots" },
  { id: "cibo", label: "Cibo", kind: "expense", icon: "food" },
  { id: "trasporti", label: "Trasporti", kind: "expense", icon: "transport" },
  { id: "vestiti", label: "Vestiti", kind: "expense", icon: "clothing" },
  { id: "viaggi", label: "Viaggi", kind: "expense", icon: "travel" },
  { id: "benzina", label: "Benzina", kind: "expense", icon: "fuel" },
  { id: "salute", label: "Salute", kind: "expense", icon: "health" },
  { id: "estetista", label: "Estetista", kind: "expense", icon: "beauty" },
  { id: "altro-spesa", label: "Altro", kind: "expense", icon: "dots" },
];

export const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.kind === "income");
export const EXPENSE_CATEGORIES = CATEGORIES.filter(
  (c) => c.kind === "expense",
);

const FALLBACK_BY_KIND: Record<CategoryKind, CategoryDefinition> = {
  income: INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1],
  expense: EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1],
};

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

/**
 * Builds the complete catalog for one user. Hidden defaults and archived custom
 * categories are intentionally included: they must still label and filter old
 * transactions. Use `isCategoryAvailable` before proposing them for new input.
 */
export function buildCategoryCatalog(
  customCategories: CustomCategory[] = [],
  hiddenDefaultCategories: string[] = [],
): CategoryCatalog {
  const hidden = new Set(hiddenDefaultCategories);
  const defaults = CATEGORIES.map((category) =>
    hidden.has(category.id) ? { ...category, hidden: true } : { ...category },
  );
  const custom = customCategories.map((category) => ({
    id: category.id,
    label: category.name,
    kind: category.type,
    icon: (category.type === "income" ? "tag" : "dots") as IconName,
    custom: true,
    archived: Boolean(category.archivedAt),
  }));
  return [...defaults, ...custom];
}

export function createCategoryCatalog(
  data: Pick<BalanceData, "customCategories" | "hiddenDefaultCategories">,
): CategoryCatalog {
  return buildCategoryCatalog(
    data.customCategories ?? [],
    data.hiddenDefaultCategories ?? [],
  );
}

export function isCategoryAvailable(category: CategoryDefinition): boolean {
  return !category.hidden && !category.archived;
}

export function categoriesForType(
  type: TransactionType,
  catalog: CategoryCatalog = CATEGORIES,
): CategoryDefinition[] {
  if (type === "transfer") return [];
  return catalog.filter(
    (category) =>
      category.kind === type && isCategoryAvailable(category),
  );
}

/** Includes hidden defaults and archived custom categories. */
export function allCategoriesForType(
  type: TransactionType,
  catalog: CategoryCatalog = CATEGORIES,
): CategoryDefinition[] {
  if (type === "transfer") return [];
  return catalog.filter((category) => category.kind === type);
}

export function getCategory(
  id: string | null | undefined,
  kind: CategoryKind = "expense",
  catalog: CategoryCatalog = CATEGORIES,
): CategoryDefinition {
  if (!id) return FALLBACK_BY_KIND[kind];
  return (
    catalog.find((category) => category.id === id) ??
    FALLBACK_BY_KIND[kind]
  );
}

export function getCategoryLabel(
  id: string | null | undefined,
  kind: CategoryKind = "expense",
  catalog: CategoryCatalog = CATEGORIES,
): string {
  return getCategory(id, kind, catalog).label;
}

export function categoryKindForTransaction(type: TransactionType): CategoryKind {
  return type === "income" ? "income" : "expense";
}

/** Case-insensitive lookup across defaults, custom and archived categories. */
export function findCategoryByName(
  name: string,
  kind: CategoryKind,
  catalog: CategoryCatalog = CATEGORIES,
): CategoryDefinition | undefined {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return undefined;
  return catalog.find(
    (category) =>
      category.kind === kind &&
      normalizeCategoryName(category.label) === normalized,
  );
}

export function isDefaultCategory(id: string): boolean {
  return CATEGORIES.some((category) => category.id === id);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conto corrente",
  savings: "Risparmio",
  cash: "Contanti",
  investment: "Investimenti",
  wallet: "Portafoglio digitale",
  other: "Altro",
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  checking: "bank",
  savings: "savings",
  cash: "cash",
  investment: "investment",
  wallet: "wallet",
  other: "other",
};

export const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "savings",
  "cash",
  "investment",
  "wallet",
  "other",
];

export function isKnownCategory(
  id: string,
  kind: CategoryKind,
  catalog: CategoryCatalog = CATEGORIES,
): boolean {
  return catalog.some((category) => category.id === id && category.kind === kind);
}
