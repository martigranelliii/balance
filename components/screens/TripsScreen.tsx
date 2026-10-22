"use client";

import type { BalanceData, BusinessTrip, Transaction } from "@/lib/types";
import {
  BUSINESS_TRIP_EXPENSE_LABELS,
  businessTripTotals,
  formatKilometers,
  formatRatePerKm,
  groupOpenTripsBySettlementMonth,
  linkedTripIncome,
  openBusinessTrips,
  reimbursedBusinessTrips,
  summarizeBusinessTrips,
} from "@/lib/trips";
import {
  capitalize,
  formatShortDate,
  monthLabel,
  timestampToLocalLabel,
} from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Icon } from "../ui/Icon";
import { EmptyState } from "../ui/EmptyState";

interface TripsScreenProps {
  data: BalanceData;
  onAddTrip: () => void;
  onEditTrip: (trip: BusinessTrip) => void;
  onMarkReimbursed: (trip: BusinessTrip) => void;
  onReopenTrip: (trip: BusinessTrip) => void;
  onDeleteTrip: (trip: BusinessTrip) => void;
}

function linkedTransactionCopy(
  trip: BusinessTrip,
  transactions: Transaction[],
): string | null {
  if (!trip.linkedSalaryTransactionId) return null;
  const transaction = transactions.find(
    (item) => item.id === trip.linkedSalaryTransactionId,
  );
  if (!transaction) return "Collegata a un movimento non più presente.";
  return `Collegata a ${transaction.description || "stipendio"} del ${formatShortDate(
    transaction.date,
    true,
  )}.`;
}

function TripCard({
  trip,
  transactions,
  onEdit,
  onMarkReimbursed,
  onReopen,
  onDelete,
}: {
  trip: BusinessTrip;
  transactions: Transaction[];
  onEdit: () => void;
  onMarkReimbursed?: () => void;
  onReopen?: () => void;
  onDelete: () => void;
}) {
  const totals = businessTripTotals(trip);
  const reimbursed = trip.status === "reimbursed";
  const linkedCopy = linkedTransactionCopy(trip, transactions);

  return (
    <article className={`trip-card${reimbursed ? " trip-card--reimbursed" : ""}`}>
      <header className="trip-card-header">
        <div className="trip-card-heading">
          <p className="trip-card-date">
            {formatShortDate(trip.date, true)}
            {trip.location ? <span> · {trip.location}</span> : null}
          </p>
          <h3>{trip.title}</h3>
        </div>
        <span
          className={`trip-status${reimbursed ? " trip-status--done" : ""}`}
        >
          {reimbursed ? "Rimborsata" : "Aperta"}
        </span>
      </header>

      <dl className="trip-breakdown">
        <div className="trip-breakdown-reimbursement">
          <dt>Spese da rimborsare</dt>
          <dd>{formatMoney(totals.expenseReimbursementCents)}</dd>
        </div>
        {totals.kmReimbursementCents > 0 ? (
          <div>
            <dt>
              {formatKilometers(trip.kilometers)} km ×{" "}
              {formatRatePerKm(trip.ratePerKmMills)}
            </dt>
            <dd>{formatMoney(totals.kmReimbursementCents)}</dd>
          </div>
        ) : null}
        {totals.allowanceCents > 0 ? (
          <div>
            <dt>Indennità</dt>
            <dd>{formatMoney(totals.allowanceCents)}</dd>
          </div>
        ) : null}
        <div className="trip-breakdown-earnings">
          <dt>Extra guadagnato</dt>
          <dd>{formatMoney(totals.tripEarningsCents)}</dd>
        </div>
        <div className="trip-breakdown-total">
          <dt>Totale atteso</dt>
          <dd>{formatMoney(totals.expectedSettlementCents)}</dd>
        </div>
      </dl>

      <p className="trip-card-footnote">
        {reimbursed
          ? linkedCopy ??
            `Segnata come rimborsata${
              trip.reimbursedAt
                ? ` il ${timestampToLocalLabel(trip.reimbursedAt)}`
                : ""
            }.`
          : `Prevista nello stipendio di ${capitalize(
              monthLabel(trip.expectedSettlementMonth ?? ""),
            )}.`}
        {" "}Le spese sono un rimborso; km e indennità sono guadagno reale.
      </p>

      {trip.expenses.length > 0 ? (
        <details className="trip-expenses-details">
          <summary>
            Dettaglio spese
            <span>{trip.expenses.length}</span>
          </summary>
          <ul>
            {trip.expenses.map((expense) => (
              <li key={expense.id}>
                <span>
                  {BUSINESS_TRIP_EXPENSE_LABELS[expense.category]}
                  {expense.description ? ` · ${expense.description}` : ""}
                </span>
                <strong>{formatMoney(expense.amountCents)}</strong>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="trip-card-actions">
        <button
          type="button"
          className="text-link"
          onClick={onEdit}
          aria-label={`Modifica ${trip.title}`}
        >
          <Icon name="edit" size={14} />
          Modifica
        </button>
        <button
          type="button"
          className="text-link text-link--danger"
          onClick={onDelete}
          aria-label={`Elimina ${trip.title}`}
        >
          <Icon name="trash" size={14} />
          Elimina
        </button>
        {reimbursed ? (
          <button type="button" className="button button--soft button--small" onClick={onReopen}>
            Riapri
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary button--small"
            onClick={onMarkReimbursed}
          >
            Segna rimborsata
          </button>
        )}
      </div>
    </article>
  );
}

export function TripsScreen({
  data,
  onAddTrip,
  onEditTrip,
  onMarkReimbursed,
  onReopenTrip,
  onDeleteTrip,
}: TripsScreenProps) {
  const summary = summarizeBusinessTrips(data.businessTrips);
  const open = openBusinessTrips(data.businessTrips);
  const reimbursed = reimbursedBusinessTrips(data.businessTrips);
  const monthGroups = groupOpenTripsBySettlementMonth(data.businessTrips);
  const linkedIncomes = linkedTripIncome(
    data.transactions,
    data.businessTrips,
  );

  return (
    <div className="screen screen--trips">
      <header className="screen-header">
        <div className="screen-header-main">
          <p className="eyebrow">Lavoro</p>
          <h1 className="screen-title">Trasferte</h1>
        </div>
        <button
          type="button"
          className="button button--primary screen-add desktop-only-flex"
          onClick={onAddTrip}
        >
          <Icon name="plus" size={17} />
          Nuova trasferta
        </button>
      </header>

      <p className="screen-lede">
        Le spese anticipate vengono rimborsate. Chilometri e indennità sono
        extra guadagnati. Tutto resta fuori dai movimenti del conto.
      </p>

      {data.businessTrips.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title="Nessuna trasferta"
          body="Registra le spese che hai anticipato, i chilometri e l’indennità. Saprai quanto deve rientrare e quando."
          action={
            <button
              type="button"
              className="button button--primary button--small"
              onClick={onAddTrip}
            >
              <Icon name="plus" size={16} />
              Nuova trasferta
            </button>
          }
        />
      ) : (
        <>
          <section className="trip-dashboard" aria-labelledby="trip-total-title">
            <div className="trip-dashboard-main">
              <p className="eyebrow">Totale atteso</p>
              <h2 id="trip-total-title" className="trip-dashboard-total">
                {formatMoney(summary.expectedSettlementCents)}
              </h2>
              <p className="trip-dashboard-caption">
                {summary.openCount === 0
                  ? "Nessuna trasferta aperta."
                  : `${summary.openCount} ${
                      summary.openCount === 1
                        ? "trasferta aperta"
                        : "trasferte aperte"
                    }.`}
              </p>
            </div>
            <div className="trip-dashboard-grid">
              <div>
                <span>Spese da rimborsare</span>
                <strong>{formatMoney(summary.expenseReimbursementCents)}</strong>
              </div>
              <div>
                <span>Extra guadagnato</span>
                <strong>{formatMoney(summary.tripEarningsCents)}</strong>
              </div>
              <div>
                <span>Totale atteso</span>
                <strong>{formatMoney(summary.expectedSettlementCents)}</strong>
              </div>
            </div>
          </section>

          {open.length > 0 ? (
            <section className="trip-section" aria-labelledby="open-trips-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">In attesa</p>
                  <h2 id="open-trips-title">Trasferte aperte</h2>
                </div>
                <span className="trip-count">{open.length}</span>
              </div>

              {monthGroups.map((group) => (
                <div className="trip-month-group" key={group.month}>
                  <div className="trip-month-head">
                    <div>
                      <p className="eyebrow">
                        Da recuperare nello stipendio di
                      </p>
                      <h3>{capitalize(monthLabel(group.month))}</h3>
                    </div>
                    <strong>
                      {formatMoney(group.expectedSettlementCents)}
                    </strong>
                  </div>
                  <dl className="trip-month-breakdown">
                    <div>
                      <dt>Spese da rimborsare</dt>
                      <dd>{formatMoney(group.expenseReimbursementCents)}</dd>
                    </div>
                    <div>
                      <dt>Extra guadagnato</dt>
                      <dd>{formatMoney(group.tripEarningsCents)}</dd>
                    </div>
                    <div>
                      <dt>Totale atteso</dt>
                      <dd>{formatMoney(group.expectedSettlementCents)}</dd>
                    </div>
                  </dl>
                  <div className="trip-card-list">
                    {group.trips.map((trip) => (
                      <TripCard
                        key={trip.id}
                        trip={trip}
                        transactions={data.transactions}
                        onEdit={() => onEditTrip(trip)}
                        onMarkReimbursed={() => onMarkReimbursed(trip)}
                        onDelete={() => onDeleteTrip(trip)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {reimbursed.length > 0 ? (
            <section className="trip-section" aria-labelledby="done-trips-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Archivio</p>
                  <h2 id="done-trips-title">Trasferte rimborsate</h2>
                </div>
                <span className="trip-count">{reimbursed.length}</span>
              </div>
              <div className="trip-card-list">
                {reimbursed.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    transactions={data.transactions}
                    onEdit={() => onEditTrip(trip)}
                    onReopen={() => onReopenTrip(trip)}
                    onDelete={() => onDeleteTrip(trip)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {linkedIncomes.length > 0 ? (
            <section
              className="trip-section linked-income-section"
              aria-labelledby="linked-income-title"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Stipendi e rimborsi</p>
                  <h2 id="linked-income-title">Reddito effettivo</h2>
                </div>
                <span className="trip-count">{linkedIncomes.length}</span>
              </div>
              <p className="linked-income-lede">
                Il movimento bancario non cambia. Qui vedi quanto resta come
                reddito dopo aver tolto le sole spese anticipate rimborsate.
              </p>
              <div className="linked-income-list">
                {linkedIncomes.map((income) => (
                  <article className="linked-income-card" key={income.transaction.id}>
                    <header className="linked-income-head">
                      <div>
                        <strong>
                          {income.transaction.description || "Entrata"}
                        </strong>
                        <span>
                          {formatShortDate(income.transaction.date, true)}
                          {" · "}
                          {income.trips.length}{" "}
                          {income.trips.length === 1
                            ? "trasferta collegata"
                            : "trasferte collegate"}
                        </span>
                      </div>
                      <span className="linked-income-bank">
                        {formatMoney(income.receivedCents)}
                      </span>
                    </header>
                    <dl className="linked-income-breakdown">
                      <div>
                        <dt>Importo sul conto</dt>
                        <dd>{formatMoney(income.receivedCents)}</dd>
                      </div>
                      <div>
                        <dt>Spese da rimborsare</dt>
                        <dd>−{formatMoney(income.expenseReimbursementCents)}</dd>
                      </div>
                      <div className="linked-income-extra">
                        <dt>Extra guadagnato (non sottratto)</dt>
                        <dd>{formatMoney(income.tripEarningsCents)}</dd>
                      </div>
                      <div className="linked-income-total">
                        <dt>Reddito effettivo</dt>
                        <dd>{formatMoney(income.effectiveIncomeCents)}</dd>
                      </div>
                    </dl>
                    <p className="linked-income-note">
                      I chilometri e l’indennità restano guadagno reale. Il
                      movimento originale vale sempre{" "}
                      {formatMoney(income.receivedCents)}.
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="manual-note trip-note">
            <span className="manual-note-icon">
              <Icon name="briefcase" size={18} />
            </span>
            <div>
              <strong>Un promemoria, non un movimento</strong>
              <p>
                Le trasferte non aumentano le spese bancarie. Quando lo stipendio
                arriva, lo registri come sempre: qui puoi segnare la trasferta
                come rimborsata e vedere il reddito effettivo, senza toccare
                l’importo bancario.
              </p>
            </div>
          </div>
        </>
      )}

      {data.businessTrips.length > 0 ? (
        <button
          type="button"
          className="button button--primary trip-mobile-add"
          onClick={onAddTrip}
        >
          <Icon name="plus" size={17} />
          Nuova trasferta
        </button>
      ) : null}
    </div>
  );
}
