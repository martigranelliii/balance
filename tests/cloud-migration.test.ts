import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createEmptyData, normalizeBalanceData } from "../lib/storage";
import { deleteAllData, initializeCloudStore } from "../lib/store";
import type { BalanceData } from "../lib/types";
import {
  getLocalDataOwner,
  localDataOwnerMatches,
  markLocalDataOwner,
  mergeLocalDataForMigration,
  readLocalBalanceForMigration,
} from "../lib/local-migration";

const NOW = "2026-10-22T10:00:00.000Z";

function localData(): BalanceData {
  const data = createEmptyData();
  data.updatedAt = NOW;
  data.settings.defaultRatePerKmMills = 488;
  data.transactions = [
    {
      id: "tx_local",
      date: "2026-10-20",
      type: "expense",
      amountCents: 1290,
      category: "cibo",
      description: "Pranzo",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "tx_transfer",
      date: "2026-10-21",
      type: "transfer",
      amountCents: 50000,
      category: null,
      accountId: "acc_local",
      toAccountId: "acc_local_2",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  data.accounts = [
    {
      id: "acc_local",
      name: "Conto principale",
      type: "checking",
      currentBalanceCents: 123456,
      includeInNetWorth: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "acc_local_2",
      name: "Risparmi",
      type: "savings",
      currentBalanceCents: 500000,
      includeInNetWorth: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  data.monthlyBudgets = [
    {
      id: "budget_local",
      month: "2026-10",
      categories: { cibo: 30000 },
      updatedAt: NOW,
    },
  ];
  data.categoryRules = [
    {
      id: "rule_local",
      pattern: "PRANZO",
      category: "cibo",
      kind: "expense",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  data.importBatches = [
    {
      id: "batch_local",
      fileName: "estratto.csv",
      fileType: "csv",
      importedAt: NOW,
      transactionCount: 1,
      rowCount: 1,
      skippedCount: 0,
    },
  ];
  data.businessTrips = [
    {
      id: "trip_local",
      date: "2026-10-10",
      title: "Milano",
      expenses: [],
      status: "open",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  data.personalBalanceItems = [
    {
      id: "personal_local",
      direction: "receivable",
      person: "Luca",
      description: "Cena",
      amountCents: 2500,
      date: "2026-10-12",
      status: "open",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  data.netWorthSnapshots = [
    {
      id: "snapshot_local",
      date: "2026-10-22",
      totalCents: 623456,
      liquidCents: 623456,
      investmentsCents: 0,
      accounts: [],
      createdAt: NOW,
    },
  ];
  data.historicalMonthlySummaries = [
    {
      id: "history_local",
      month: "2026-09",
      incomeByCategory: { stipendio: 200000 },
      expenseByCategory: { cibo: 30000 },
      totalIncomeCents: 200000,
      totalExpensesCents: 30000,
      savingsCents: 170000,
      source: "historical-import",
      createdAt: NOW,
    },
  ];
  return data;
}

describe("local data migration", () => {
  it("keeps balance.v1 readable and leaves it untouched when read", () => {
    const stored = new Map<string, string>();
    const raw = JSON.stringify(localData());
    stored.set("balance.v1", raw);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });

    const snapshot = readLocalBalanceForMigration();

    expect(snapshot?.summary).toEqual({
      transactions: 2,
      accounts: 2,
      budgets: 1,
      trips: 1,
      personalItems: 1,
    });
    expect(stored.get("balance.v1")).toBe(raw);
    expect(stored.has("balance.v1")).toBe(true);
  });

  it("never deletes balance.v1 when cloud data is deleted", () => {
    const stored = new Map<string, string>();
    stored.set("balance.v1", JSON.stringify(localData()));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
      addEventListener: () => undefined,
    });

    initializeCloudStore(createEmptyData(), "user_martina");
    deleteAllData();

    expect(stored.has("balance.v1")).toBe(true);
    expect(JSON.parse(stored.get("balance.v1")!)).toMatchObject({
      version: 1,
    });
  });

  it("does not offer Martina's local data to a different account", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });

    markLocalDataOwner("user_martina");
    expect(getLocalDataOwner()).toBe("user_martina");
    expect(localDataOwnerMatches("user_martina")).toBe(true);
    expect(localDataOwnerMatches("user_altro")).toBe(false);
  });

  it("migrates every existing data structure into an empty cloud account", () => {
    const local = localData();
    const merged = mergeLocalDataForMigration(
      createEmptyData(),
      local,
      false,
    );

    expect(merged.settings.defaultRatePerKmMills).toBe(488);
    expect(merged.transactions.map((item) => item.id)).toEqual([
      "tx_local",
      "tx_transfer",
    ]);
    expect(merged.accounts).toHaveLength(2);
    expect(merged.monthlyBudgets[0]?.categories.cibo).toBe(30000);
    expect(merged.categoryRules[0]?.pattern).toBe("PRANZO");
    expect(merged.importBatches[0]?.id).toBe("batch_local");
    expect(merged.businessTrips[0]?.id).toBe("trip_local");
    expect(merged.personalBalanceItems[0]?.id).toBe("personal_local");
    expect(merged.netWorthSnapshots[0]?.id).toBe("snapshot_local");
    expect(merged.historicalMonthlySummaries[0]?.id).toBe("history_local");
  });

  it("is idempotent when the same local data is imported twice", () => {
    const local = localData();
    const first = mergeLocalDataForMigration(createEmptyData(), local, false);
    const second = mergeLocalDataForMigration(first, local, true);
    const third = mergeLocalDataForMigration(second, local, true);

    expect(second.transactions).toHaveLength(2);
    expect(second.accounts).toHaveLength(2);
    expect(second.monthlyBudgets).toHaveLength(1);
    expect(third.transactions).toHaveLength(2);
    expect(third.businessTrips).toHaveLength(1);
    expect(third.personalBalanceItems).toHaveLength(1);
    expect(third.categoryRules).toHaveLength(1);
  });

  it("preserves unknown top-level fields from existing data", () => {
    const raw = { ...localData(), futureAdditiveField: { enabled: true } };
    const normalized = normalizeBalanceData(raw).data as BalanceData & {
      futureAdditiveField?: { enabled: boolean };
    };

    expect(normalized.futureAdditiveField).toEqual({ enabled: true });
    expect(normalized.transactions).toHaveLength(2);
  });

  it("does not replace transactions already saved in the cloud", () => {
    const cloud = createEmptyData();
    cloud.transactions = [
      {
        id: "tx_cloud",
        date: "2026-10-22",
        type: "income",
        amountCents: 1000,
        category: "rimborsi",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const merged = mergeLocalDataForMigration(cloud, localData(), true);

    expect(merged.transactions.map((item) => item.id)).toEqual([
      "tx_cloud",
      "tx_local",
      "tx_transfer",
    ]);
  });
});

describe("Supabase schema", () => {
  it("enables RLS and restricts every operation to the authenticated owner", () => {
    const sql = readFileSync(
      new URL(
        "../supabase/migrations/20261022000000_create_balance_data.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(sql).toContain("enable row level security");
    expect(sql).toContain("references auth.users");
    expect(sql).toContain("revoke all on table public.balance_data from anon");
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.balance_data to authenticated",
    );
    expect(sql).toContain('"balance_data_select_own"');
    expect(sql).toContain('"balance_data_insert_own"');
    expect(sql).toContain('"balance_data_update_own"');
    expect(sql).toContain('"balance_data_delete_own"');
    expect(sql.match(/auth\.uid\(\)\) = user_id/g)?.length).toBe(5);
    expect(sql).not.toContain("service_role");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
