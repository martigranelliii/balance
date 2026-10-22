"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BalanceApp } from "../BalanceApp";
import { Icon } from "../ui/Icon";
import { AuthProvider } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import {
  loadCloudBalance,
  migrateLocalDataToCloud,
} from "@/lib/cloud";
import {
  localDataOwnerMatches,
  markLocalDataOwner,
  readLocalBalanceForMigration,
  type LocalMigrationSnapshot,
} from "@/lib/local-migration";
import {
  initializeCloudStore,
  resetStoreForSession,
  updateCloudStoreData,
} from "@/lib/store";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type Phase =
  | "loading"
  | "signed-out"
  | "loading-data"
  | "ready"
  | "error"
  | "unconfigured";

function Glow() {
  return (
    <div className="loading-screen" aria-busy="true" aria-label="Caricamento di Balance">
      <p className="brand-mark" aria-hidden="true">
        balance<span>.</span>
      </p>
      <div className="loading-rule" />
      <p>Apertura del tuo account.</p>
    </div>
  );
}

function MigrationPrompt({
  snapshot,
  busy,
  error,
  onImport,
  onDismiss,
}: {
  snapshot: LocalMigrationSnapshot;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onDismiss: () => void;
}) {
  const { summary } = snapshot;
  const parts = [
    summary.transactions
      ? `${summary.transactions} moviment${summary.transactions === 1 ? "o" : "i"}`
      : null,
    summary.accounts
      ? `${summary.accounts} cont${summary.accounts === 1 ? "o" : "i"}`
      : null,
    summary.budgets
      ? `${summary.budgets} budget`
      : null,
    summary.trips
      ? `${summary.trips} trasfert${summary.trips === 1 ? "a" : "e"}`
      : null,
    summary.personalItems
      ? `${summary.personalItems} voc${summary.personalItems === 1 ? "e" : "i"} da ricevere/dare`
      : null,
  ].filter(Boolean);

  return (
    <div className="migration-overlay" role="dialog" aria-modal="true" aria-labelledby="migration-title">
      <div className="migration-card">
        <span className="auth-lock" aria-hidden="true">
          <Icon name="upload" size={21} />
        </span>
        <p className="eyebrow">Dati locali trovati</p>
        <h2 id="migration-title">Aggiungi i dati di questo dispositivo?</h2>
        <p>
          Abbiamo trovato i tuoi dati su questo dispositivo: {parts.join(", ")}.
          Vuoi importarli nel tuo account?
        </p>
        <p className="migration-note">
          Importa solo se questi dati sono tuoi. La copia locale non verrà
          cancellata.
        </p>

        {error ? (
          <div className="auth-message auth-message--error" role="alert">
            <Icon name="info" size={16} />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="migration-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={onImport}
            disabled={busy}
          >
            {busy ? "Importazione…" : "Importa nel mio account"}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={onDismiss}
            disabled={busy}
          >
            Non ora
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigMissing() {
  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--config">
        <div className="auth-brand">
          <p className="brand-mark" aria-hidden="true">
            balance<span>.</span>
          </p>
          <p>Configurazione necessaria.</p>
        </div>
        <h1>Supabase non è ancora collegato.</h1>
        <p>
          Aggiungi <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>{" "}
          (o nelle Environment Variables di Vercel), poi riavvia l’app.
        </p>
      </div>
    </div>
  );
}

export function AuthGate() {
  const configured = isSupabaseConfigured();
  const initialPhase: Phase = configured ? "loading" : "unconfigured";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const phaseRef = useRef<Phase>(initialPhase);
  const [user, setUser] = useState<User | null>(null);
  const activeUserRef = useRef<User | null>(null);
  const requestRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [migration, setMigration] =
    useState<LocalMigrationSnapshot | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setPhaseSafe = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const loadForUser = useCallback(
    async (nextUser: User, force = false) => {
      if (
        !force &&
        activeUserRef.current?.id === nextUser.id &&
        (phaseRef.current === "ready" || phaseRef.current === "loading-data")
      ) {
        return;
      }

      activeUserRef.current = nextUser;
      const requestId = ++requestRef.current;
      setUser(nextUser);
      setError(null);
      setMigration(null);
      setMigrationError(null);
      setPhaseSafe("loading-data");

      try {
        const cloud = await loadCloudBalance(nextUser.id);
        if (requestId !== requestRef.current) return;

        initializeCloudStore(cloud.data, nextUser.id);
        setMigration(
          localDataOwnerMatches(nextUser.id)
            ? readLocalBalanceForMigration()
            : null,
        );
        setPhaseSafe("ready");
      } catch (loadError) {
        if (requestId !== requestRef.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossibile caricare i dati dal cloud.",
        );
        setPhaseSafe("error");
      }
    },
    [setPhaseSafe],
  );

  const handleSignedOut = useCallback(() => {
    requestRef.current += 1;
    activeUserRef.current = null;
    resetStoreForSession();
    setUser(null);
    setError(null);
    setMigration(null);
    setMigrationError(null);
    setNotice(null);
    setPhaseSafe("signed-out");
  }, [setPhaseSafe]);

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      queueMicrotask(() => setPhaseSafe("unconfigured"));
      return;
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          void loadForUser(session.user);
        } else {
          handleSignedOut();
        }
      },
    );

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session?.user) {
          void loadForUser(data.session.user);
        } else {
          handleSignedOut();
        }
      })
      .catch(() => handleSignedOut());

    return () => {
      requestRef.current += 1;
      subscription.subscription.unsubscribe();
    };
  }, [configured, handleSignedOut, loadForUser, setPhaseSafe]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    handleSignedOut();
    if (supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("Uscita non riuscita. Riprova.");
      }
    }
  }, [handleSignedOut]);

  async function handleImport() {
    if (!user || !migration) return;
    setMigrating(true);
    setMigrationError(null);

    try {
      const merged = await migrateLocalDataToCloud(user.id, migration);
      markLocalDataOwner(user.id);
      updateCloudStoreData(merged);
      const { summary } = migration;
      setMigration(null);
      setNotice(
        `Importazione completata: ${summary.transactions} movimenti, ${summary.accounts} conti e ${summary.budgets} budget.`,
      );
    } catch (importError) {
      setMigrationError(
        importError instanceof Error
          ? importError.message
          : "Importazione non riuscita. Riprova.",
      );
    } finally {
      setMigrating(false);
    }
  }

  if (phase === "unconfigured") return <ConfigMissing />;
  if (phase === "loading" || phase === "loading-data") return <Glow />;
  if (phase === "signed-out") return <AuthScreen />;

  if (phase === "error" || !user) {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-card--config" role="alert">
          <span className="auth-lock" aria-hidden="true">
            <Icon name="info" size={21} />
          </span>
          <h1>Impossibile aprire i tuoi dati.</h1>
          <p>{error ?? "Errore imprevisto."}</p>
          <div className="migration-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void loadForUser(user!, true)}
            >
              Riprova
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void signOut()}
            >
              Esci
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider
      value={{ email: user.email ?? "", signOut }}
    >
      <BalanceApp />

      {migration ? (
        <MigrationPrompt
          snapshot={migration}
          busy={migrating}
          error={migrationError}
          onImport={() => void handleImport()}
          onDismiss={() => {
            setMigration(null);
            setMigrationError(null);
          }}
        />
      ) : null}

      {notice ? (
        <div className="auth-toast" role="status">
          <Icon name="check" size={16} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Chiudi">
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}
    </AuthProvider>
  );
}
