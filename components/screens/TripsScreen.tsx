"use client";

import type { BalanceData, BusinessTrip, Transaction } from "@/lib/types";
import {
  BUSINESS_TRIP_EXPENSE_LABELS,
  businessTripTotals,
  formatKilometers,
  formatRatePerKm,
  groupOpenTripsBySettlementMonth,
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
        <div>
          <dt>Spese sostenute</dt>
          <dd>{formatMoney(totals.expensesCents)}</dd>
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
        <div className="trip-breakdown-total">
          <dt>Totale atteso</dt>
          <dd>{formatMoney(totals.totalCents)}</dd>
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
        Spese anticipate, chilometri e indennità da recuperare. Restano fuori
        dai movimenti del conto.
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
              <p className="eyebrow">Da recuperare</p>
              <h2 id="trip-total-title" className="trip-dashboard-total">
                {formatMoney(summary.totalCents)}
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
                <span>Spese anticipate</span>
                <strong>{formatMoney(summary.expensesCents)}</strong>
              </div>
              <div>
                <span>Km da rimborsare</span>
                <strong>{formatMoney(summary.kmReimbursementCents)}</strong>
              </div>
              <div>
                <span>Indennità da ricevere</span>
                <strong>{formatMoney(summary.allowanceCents)}</strong>
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
                    <strong>{formatMoney(group.totalCents)}</strong>
                  </div>
                  <dl className="trip-month-breakdown">
                    <div>
                      <dt>Spese</dt>
                      <dd>{formatMoney(group.expensesCents)}</dd>
                    </div>
                    <div>
                      <dt>Km</dt>
                      <dd>{formatMoney(group.kmReimbursementCents)}</dd>
                    </div>
                    <div>
                      <dt>Indennità</dt>
                      <dd>{formatMoney(group.allowanceCents)}</dd>
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

          <div className="manual-note trip-note">
            <span className="manual-note-icon">
              <Icon name="briefcase" size={18} />
            </span>
            <div>
              <strong>Un promemoria, non un movimento</strong>
              <p>
                Le trasferte non aumentano le spese bancarie. Quando lo stipendio
                arriva, lo registri come sempre: qui puoi solo segnare la
                trasferta come rimborsata.
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
