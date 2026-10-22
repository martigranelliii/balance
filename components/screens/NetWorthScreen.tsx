"use client";

import type {
  Account,
  BalanceData,
  PersonalBalanceDirection,
  PersonalBalanceItem,
} from "@/lib/types";
import {
  calculateNetWorth,
  snapshotChange,
  snapshotSeries,
} from "@/lib/finance";
import { ACCOUNT_TYPE_LABELS } from "@/lib/categories";
import {
  groupPersonalByPerson,
  settledPersonalItems,
  summarizePersonalBalance,
} from "@/lib/trips";
import { formatMoney } from "@/lib/money";
import { formatShortDate, timestampToLocalLabel } from "@/lib/dates";
import { Icon } from "../ui/Icon";
import { AccountIcon } from "../ui/CategoryIcon";
import { EmptyState } from "../ui/EmptyState";
import { NetWorthChart } from "../ui/NetWorthChart";

interface NetWorthScreenProps {
  data: BalanceData;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onCaptureSnapshot: () => void;
  onAddPersonalItem: () => void;
  onEditPersonalItem: (item: PersonalBalanceItem) => void;
  onSettlePersonalItem: (item: PersonalBalanceItem) => void;
  onDeletePersonalItem: (item: PersonalBalanceItem) => void;
}

function AccountRow({
  account,
  onEdit,
}: {
  account: Account;
  onEdit: () => void;
}) {
  return (
    <button type="button" className="account-row" onClick={onEdit}>
      <AccountIcon type={account.type} />
      <span className="account-copy">
        <span className="account-name">{account.name}</span>
        <span className="account-meta">
          {ACCOUNT_TYPE_LABELS[account.type]}
          {!account.includeInNetWorth ? " · escluso dal patrimonio" : ""}
        </span>
      </span>
      <span className="account-balance">
        {formatMoney(account.currentBalanceCents)}
        <Icon name="edit" size={14} />
      </span>
    </button>
  );
}

function PersonalRow({
  item,
  showPerson = false,
  onEdit,
  onSettle,
  onDelete,
}: {
  item: PersonalBalanceItem;
  showPerson?: boolean;
  onEdit: () => void;
  onSettle?: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="personal-row">
      <div className="personal-row-main">
        <div className="personal-row-copy">
          <strong>{item.description}</strong>
          <span>
            {showPerson ? `${item.person} · ` : ""}
            {formatShortDate(item.date, true)}
            {item.dueDate
              ? ` · entro il ${formatShortDate(item.dueDate, true)}`
              : ""}
            {item.status === "settled" && item.settledAt
              ? ` · saldata il ${timestampToLocalLabel(item.settledAt)}`
              : ""}
          </span>
        </div>
        <span className="personal-row-amount">
          {formatMoney(item.amountCents)}
        </span>
      </div>
      <div className="personal-row-actions">
        {onSettle ? (
          <button type="button" className="text-link" onClick={onSettle}>
            <Icon name="check" size={14} />
            Salda
          </button>
        ) : null}
        <button
          type="button"
          className="text-link"
          onClick={onEdit}
          aria-label={`Modifica ${item.description} di ${item.person}`}
        >
          <Icon name="edit" size={14} />
          Modifica
        </button>
        <button
          type="button"
          className="text-link text-link--danger"
          onClick={onDelete}
          aria-label={`Elimina ${item.description} di ${item.person}`}
        >
          <Icon name="trash" size={14} />
          Elimina
        </button>
      </div>
    </article>
  );
}

function PersonalDirectionSection({
  direction,
  items,
  onEdit,
  onSettle,
  onDelete,
}: {
  direction: PersonalBalanceDirection;
  items: PersonalBalanceItem[];
  onEdit: (item: PersonalBalanceItem) => void;
  onSettle: (item: PersonalBalanceItem) => void;
  onDelete: (item: PersonalBalanceItem) => void;
}) {
  const groups = groupPersonalByPerson(items, direction);
  const title = direction === "receivable" ? "Da ricevere" : "Da dare";
  const empty =
    direction === "receivable"
      ? "Nessun credito personale aperto."
      : "Nessun debito personale aperto.";

  return (
    <div className="personal-direction">
      <div className="personal-direction-head">
        <h3>{title}</h3>
        <span>
          {direction === "receivable"
            ? "Soldi che qualcuno ti deve."
            : "Soldi che devi a qualcuno."}
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="section-empty">{empty}</p>
      ) : (
        groups.map((group) => (
          <div className="personal-person" key={group.person.toLowerCase()}>
            <div className="personal-person-head">
              <strong>{group.person}</strong>
              <span>
                {direction === "receivable" ? "Totale da" : "Totale per"}{" "}
                {group.person} · {formatMoney(group.totalCents)}
              </span>
            </div>
            {group.items.map((item) => (
              <PersonalRow
                key={item.id}
                item={item}
                onEdit={() => onEdit(item)}
                onSettle={() => onSettle(item)}
                onDelete={() => onDelete(item)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function NetWorthScreen({
  data,
  onAddAccount,
  onEditAccount,
  onCaptureSnapshot,
  onAddPersonalItem,
  onEditPersonalItem,
  onSettlePersonalItem,
  onDeletePersonalItem,
}: NetWorthScreenProps) {
  const totals = calculateNetWorth(data.accounts);
  const snapshots = snapshotSeries(data.netWorthSnapshots);
  const latest = snapshots.at(-1);
  const change = snapshotChange(data.netWorthSnapshots);
  const liquidAccounts = data.accounts.filter(
    (account) => account.type !== "investment" && account.includeInNetWorth,
  );
  const investmentAccounts = data.accounts.filter(
    (account) => account.type === "investment" && account.includeInNetWorth,
  );
  const excludedAccounts = data.accounts.filter(
    (account) => !account.includeInNetWorth,
  );
  const chartSnapshots = snapshots.slice(-30);
  const chartPoints = chartSnapshots.map((snapshot) => ({
    date: snapshot.date,
    totalCents: snapshot.totalCents,
  }));
  const compositionAccounts = [...totals.includedAccounts]
    .filter((account) => account.currentBalanceCents !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.currentBalanceCents) - Math.abs(a.currentBalanceCents),
    );
  const compositionGross =
    totals.assetsCents + totals.liabilitiesCents || 1;
  const personalTotals = summarizePersonalBalance(data.personalBalanceItems);
  const settledItems = settledPersonalItems(data.personalBalanceItems);

  return (
    <div className="screen screen--networth">
      <header className="screen-header">
        <div className="screen-header-main">
          <p className="eyebrow">Saldi e conti</p>
          <h1 className="screen-title">Patrimonio</h1>
        </div>
        <button
          type="button"
          className="button button--primary screen-add"
          onClick={onAddAccount}
        >
          <Icon name="plus" size={17} />
          Conto
        </button>
      </header>

      <p className="screen-lede">
        Il totale include solo i conti attivi. I saldi li aggiorni tu.
      </p>

      {data.accounts.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Aggiungi un conto"
          body="Conto corrente, risparmi, contanti, investimenti o portafoglio digitale. Inserisci il saldo attuale."
          action={
            <button
              type="button"
              className="button button--primary button--small"
              onClick={onAddAccount}
            >
              Aggiungi il primo conto
            </button>
          }
        />
      ) : (
        <>
          <section className="networth-hero" aria-labelledby="networth-total-title">
            <div className="networth-hero-head">
              <div>
                <p className="eyebrow">Totale patrimonio</p>
                <h2 id="networth-total-title" className="networth-total">
                  {formatMoney(totals.totalCents)}
                </h2>
              </div>
              {latest ? (
                <span className="snapshot-date">
                  <Icon name="camera" size={14} />
                  {formatShortDate(latest.date, true)}
                </span>
              ) : null}
            </div>

            <div className="networth-splits networth-splits--four">
              <div>
                <span className="networth-split-label">Liquidità</span>
                <strong>{formatMoney(totals.liquidCents)}</strong>
              </div>
              <div>
                <span className="networth-split-label">Investimenti</span>
                <strong>{formatMoney(totals.investmentsCents)}</strong>
              </div>
              <div>
                <span className="networth-split-label">Attività</span>
                <strong>{formatMoney(totals.assetsCents)}</strong>
              </div>
              <div>
                <span className="networth-split-label">Passività</span>
                <strong>
                  {totals.liabilitiesCents > 0
                    ? `−${formatMoney(totals.liabilitiesCents)}`
                    : formatMoney(0)}
                </strong>
              </div>
            </div>

            {!totals.hasIncludedAccounts ? (
              <p className="networth-warning">
                Tutti i conti sono esclusi dal patrimonio. Riattiva almeno un
                conto per vedere un totale.
              </p>
            ) : (
              <div className="networth-hero-actions">
                <button
                  type="button"
                  className="button button--soft button--small"
                  onClick={onCaptureSnapshot}
                >
                  <Icon name="camera" size={16} />
                  Salva fotografia
                </button>
                <span className="networth-hero-note">
                  Un aggiornamento al giorno.
                </span>
              </div>
            )}
          </section>

          <section className="panel trend-panel" aria-labelledby="trend-title">
            <div className="panel-heading trend-panel-heading">
              <div>
                <p className="eyebrow">Nel tempo</p>
                <h2 id="trend-title">Andamento del patrimonio</h2>
              </div>
              {change ? (
                <span
                  className={`change-label${
                    change.changeCents > 0
                      ? " change-label--up"
                      : change.changeCents < 0
                        ? " change-label--down"
                        : ""
                  }`}
                >
                  {change.changeCents > 0 ? "+" : ""}
                  {formatMoney(change.changeCents)}
                  <small>
                    rispetto al {formatShortDate(change.from.date, true)}
                  </small>
                </span>
              ) : snapshots.length > 0 ? (
                <span className="trend-coming">
                  <Icon name="camera" size={13} />
                  Storico in costruzione
                </span>
              ) : null}
            </div>

            {chartPoints.length >= 2 ? (
              <>
                <NetWorthChart
                  key={chartPoints[chartPoints.length - 1]?.date}
                  points={chartPoints}
                />
                {snapshots.length > chartPoints.length ? (
                  <p className="trend-window-note">
                    Ultimi {chartPoints.length} aggiornamenti su{" "}
                    {snapshots.length} disponibili.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="trend-empty">
                <span className="trend-empty-icon">
                  <Icon name="camera" size={20} />
                </span>
                <div>
                  <strong>
                    {snapshots.length === 1
                      ? "C’è una sola fotografia del patrimonio"
                      : "Lo storico parte da qui"}
                  </strong>
                  <p>
                    {snapshots.length === 1
                      ? "Non inventiamo dati passati: il grafico comparirà dopo il prossimo aggiornamento. Balance salva automaticamente una fotografia al giorno quando apri l’app."
                      : "Aggiorna un saldo o salva una fotografia. Da lì in avanti vedrai l’andamento reale, senza ricostruzioni inventate."}
                  </p>
                </div>
              </div>
            )}

            <p className="trend-footnote">
              Ogni fotografia contiene data, totale e dettaglio dei conti. Gli
              aggiornamenti sono automatici una volta al giorno e manuali quando
              vuoi.
            </p>
          </section>

          {compositionAccounts.length > 0 ? (
            <section
              className="panel composition-panel"
              aria-labelledby="composition-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Composizione attuale</p>
                  <h2 id="composition-title">Dove sono i tuoi soldi</h2>
                </div>
                <span className="composition-total">
                  {formatMoney(totals.totalCents)}
                </span>
              </div>
              <div
                className="composition-bar"
                role="img"
                aria-label="Composizione del patrimonio per conto"
              >
                {compositionAccounts.map((account, position) => {
                  const share =
                    (Math.abs(account.currentBalanceCents) /
                      compositionGross) *
                    100;
                  return (
                    <span
                      key={account.id}
                      className={
                        account.currentBalanceCents < 0
                          ? "composition-segment composition-segment--liability"
                          : "composition-segment"
                      }
                      style={{
                        width: `${share}%`,
                        opacity:
                          account.currentBalanceCents < 0
                            ? 1
                            : Math.max(0.4, 1 - position * 0.09),
                      }}
                    />
                  );
                })}
              </div>
              <ul className="composition-list">
                {compositionAccounts.map((account) => {
                  const share =
                    (Math.abs(account.currentBalanceCents) /
                      compositionGross) *
                    100;
                  return (
                    <li key={account.id}>
                      <span className="composition-name">
                        <span className="composition-dot" aria-hidden="true" />
                        {account.name}
                      </span>
                      <span className="composition-share">
                        {share.toLocaleString("it-IT", {
                          maximumFractionDigits: 0,
                        })}
                        %
                      </span>
                      <strong
                        className={
                          account.currentBalanceCents < 0
                            ? "composition-negative"
                            : undefined
                        }
                      >
                        {formatMoney(account.currentBalanceCents)}
                      </strong>
                    </li>
                  );
                })}
              </ul>
              <div className="composition-split">
                <span>
                  Attività <strong>{formatMoney(totals.assetsCents)}</strong>
                </span>
                <span>
                  Passività{" "}
                  <strong>{formatMoney(totals.liabilitiesCents)}</strong>
                </span>
              </div>
            </section>
          ) : null}

          <section className="account-section" aria-labelledby="liquid-title">
            <div className="section-heading section-heading--tight">
              <div>
                <p className="eyebrow">Liquidità</p>
                <h2 id="liquid-title">{formatMoney(totals.liquidCents)}</h2>
              </div>
              <button type="button" className="text-link" onClick={onAddAccount}>
                + Conto
              </button>
            </div>
            {liquidAccounts.length > 0 ? (
              <div className="account-list">
                {liquidAccounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onEdit={() => onEditAccount(account)}
                  />
                ))}
              </div>
            ) : (
              <p className="section-empty">Nessun conto liquido incluso.</p>
            )}
          </section>

          <section className="account-section" aria-labelledby="investment-title">
            <div className="section-heading section-heading--tight">
              <div>
                <p className="eyebrow">Investimenti</p>
                <h2 id="investment-title">{formatMoney(totals.investmentsCents)}</h2>
              </div>
            </div>
            {investmentAccounts.length > 0 ? (
              <div className="account-list">
                {investmentAccounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onEdit={() => onEditAccount(account)}
                  />
                ))}
              </div>
            ) : (
              <p className="section-empty">
                Nessun conto di investimento incluso. Puoi aggiungerne uno quando
                vuoi.
              </p>
            )}
          </section>

          {excludedAccounts.length > 0 ? (
            <section className="account-section account-section--excluded">
              <div className="section-heading section-heading--tight">
                <div>
                  <p className="eyebrow">Fuori dal totale</p>
                  <h2>Conti esclusi</h2>
                </div>
              </div>
              <div className="account-list">
                {excludedAccounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onEdit={() => onEditAccount(account)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="personal-section" aria-labelledby="personal-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fuori dai conti</p>
            <h2 id="personal-title">Da ricevere / Da dare</h2>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={onAddPersonalItem}
          >
            + Voce
          </button>
        </div>

        <div className="personal-summary-cards">
          <div className="personal-summary-card personal-summary-card--in">
            <span>Da ricevere</span>
            <strong>{formatMoney(personalTotals.receivableCents)}</strong>
            <small>
              {personalTotals.receivableCount}{" "}
              {personalTotals.receivableCount === 1 ? "voce aperta" : "voci aperte"}
            </small>
          </div>
          <div className="personal-summary-card personal-summary-card--out">
            <span>Da dare</span>
            <strong>{formatMoney(personalTotals.payableCents)}</strong>
            <small>
              {personalTotals.payableCount}{" "}
              {personalTotals.payableCount === 1 ? "voce aperta" : "voci aperte"}
            </small>
          </div>
        </div>

        {data.personalBalanceItems.length === 0 ? (
          <p className="personal-empty">
            Annota qui i soldi che qualcuno ti deve o che devi restituire. Non
            modificano entrate, spese o saldo dei conti.
          </p>
        ) : (
          <>
            <PersonalDirectionSection
              direction="receivable"
              items={data.personalBalanceItems}
              onEdit={onEditPersonalItem}
              onSettle={onSettlePersonalItem}
              onDelete={onDeletePersonalItem}
            />
            <PersonalDirectionSection
              direction="payable"
              items={data.personalBalanceItems}
              onEdit={onEditPersonalItem}
              onSettle={onSettlePersonalItem}
              onDelete={onDeletePersonalItem}
            />

            {settledItems.length > 0 ? (
              <details className="personal-settled">
                <summary>
                  Voci saldate
                  <span>{settledItems.length}</span>
                </summary>
                <div className="personal-settled-list">
                  {settledItems.map((item) => (
                    <PersonalRow
                      key={item.id}
                      item={item}
                      showPerson
                      onEdit={() => onEditPersonalItem(item)}
                      onDelete={() => onDeletePersonalItem(item)}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}

        <p className="personal-note">
          <Icon name="info" size={14} />
          Non sono movimenti bancari. Quando li saldi, puoi collegarli a un
          movimento esistente senza crearne uno nuovo.
        </p>
      </section>

      <div className="manual-note">
        <span className="manual-note-icon">
          <Icon name="edit" size={18} />
        </span>
        <div>
          <strong>Saldi aggiornati a mano</strong>
          <p>
            Balance non si collega alla banca e non legge i tuoi conti. Aggiorni
            tu i saldi. Balance salva una fotografia datata al giorno e quando
            aggiorni un saldo, così lo storico cresce senza duplicati.
          </p>
        </div>
      </div>
    </div>
  );
}
