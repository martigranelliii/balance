"use client";

import type { Account, Transaction } from "@/lib/types";
import {
  getCategoryLabel,
  type CategoryCatalog,
} from "@/lib/categories";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/dates";
import { CategoryIcon } from "./ui/CategoryIcon";
import { Icon } from "./ui/Icon";

interface TransactionRowProps {
  transaction: Transaction;
  accounts: Account[];
  onClick: () => void;
  showDate?: boolean;
  catalog?: CategoryCatalog;
}

export function TransactionRow({
  transaction,
  accounts,
  onClick,
  showDate = false,
  catalog,
}: TransactionRowProps) {
  const account = accounts.find((item) => item.id === transaction.accountId);
  const toAccount = accounts.find((item) => item.id === transaction.toAccountId);
  const isTransfer = transaction.type === "transfer";
  const categoryLabel = isTransfer
    ? "Trasferimento"
    : getCategoryLabel(
        transaction.category,
        transaction.type === "income" ? "income" : "expense",
        catalog,
      );
  const title = transaction.description || categoryLabel;
  const metaParts: string[] = [];
  if (transaction.description) metaParts.push(categoryLabel);
  if (isTransfer && account && toAccount) {
    metaParts.push(`${account.name} → ${toAccount.name}`);
  } else if (isTransfer) {
    metaParts.push("Tra i tuoi conti");
  } else if (account) {
    metaParts.push(account.name);
  }
  if (showDate) metaParts.push(formatLongDate(transaction.date));

  const amountLabel = isTransfer
    ? formatMoney(transaction.amountCents)
    : formatSignedMoney(
        transaction.type === "expense"
          ? -transaction.amountCents
          : transaction.amountCents,
      );

  return (
    <button
      type="button"
      className="movement"
      onClick={onClick}
      aria-label={`${title}, ${categoryLabel}, ${amountLabel}${
        showDate ? `, ${formatLongDate(transaction.date)}` : ""
      }. Modifica movimento.`}
    >
      <CategoryIcon
        categoryId={transaction.category}
        kind={transaction.type === "income" ? "income" : "expense"}
        type={transaction.type}
        catalog={catalog}
      />
      <span className="movement-copy">
        <span className="movement-title">{title}</span>
        <span className="movement-meta">
          {metaParts.length > 0 ? metaParts.join(" · ") : categoryLabel}
        </span>
      </span>
      <span className={`movement-amount movement-amount--${transaction.type}`}>
        {isTransfer ? (
          <span className="transfer-amount">
            <Icon name="transfer" size={13} />
            {amountLabel}
          </span>
        ) : (
          amountLabel
        )}
      </span>
    </button>
  );
}
