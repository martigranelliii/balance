import type { AccountType, TransactionType } from "@/lib/types";
import {
  ACCOUNT_TYPE_ICONS,
  getCategory,
  type CategoryCatalog,
  type CategoryKind,
} from "@/lib/categories";
import { Icon } from "./Icon";

interface CategoryIconProps {
  categoryId?: string | null;
  kind?: CategoryKind;
  type?: TransactionType;
  size?: "sm" | "md" | "lg";
  catalog?: CategoryCatalog;
}

export function CategoryIcon({
  categoryId,
  kind = "expense",
  type,
  size = "md",
  catalog,
}: CategoryIconProps) {
  const resolvedKind: CategoryKind =
    type === "income" ? "income" : type === "transfer" ? kind : kind;
  const icon =
    type === "transfer"
      ? "transfer"
      : getCategory(categoryId, resolvedKind, catalog).icon;
  const tone =
    type === "transfer"
      ? "transfer"
      : resolvedKind === "income"
        ? "income"
        : "expense";

  return (
    <span className={`category-icon category-icon--${tone} category-icon--${size}`}>
      <Icon name={icon} size={size === "sm" ? 16 : size === "lg" ? 24 : 19} />
    </span>
  );
}

export function AccountIcon({
  type,
  size = "md",
}: {
  type: AccountType;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={`category-icon category-icon--account category-icon--${size}`}>
      <Icon
        name={ACCOUNT_TYPE_ICONS[type]}
        size={size === "sm" ? 16 : size === "lg" ? 24 : 19}
      />
    </span>
  );
}
