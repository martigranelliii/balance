"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icon } from "../ui/Icon";

type Mode = "login" | "register";

function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Email o password non corretti.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Conferma la tua email prima di accedere.";
  }
  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return "Esiste già un account con questa email.";
  }
  if (normalized.includes("password")) {
    return "La password non è valida. Usa almeno 6 caratteri.";
  }
  if (normalized.includes("email")) {
    return "Inserisci un indirizzo email valido.";
  }
  return "Accesso non riuscito. Riprova tra poco.";
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase non è configurato.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (signUpError) {
          setError(friendlyAuthError(signUpError.message));
          return;
        }
        if (!data.session) {
          setNotice(
            "Account creato. Controlla la tua email e conferma l’indirizzo per accedere.",
          );
          setMode("login");
        }
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(friendlyAuthError(signInError.message));
      }
    } catch {
      setError("Connessione non riuscita. Controlla la rete e riprova.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <p className="brand-mark" aria-hidden="true">
            balance<span>.</span>
          </p>
          <p>Il tuo spazio finanziario, privato.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Accesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "is-active" : undefined}
            onClick={() => changeMode("login")}
          >
            Accedi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "is-active" : undefined}
            onClick={() => changeMode("register")}
          >
            Registrati
          </button>
        </div>

        <div className="auth-heading">
          <span className="auth-lock" aria-hidden="true">
            <Icon name="lock" size={20} />
          </span>
          <div>
            <h1>{mode === "login" ? "Bentornato." : "Crea il tuo account."}</h1>
            <p>
              {mode === "login"
                ? "Accedi per ritrovare i tuoi movimenti su questo e altri dispositivi."
                : "I tuoi dati saranno visibili solo a te e protetti dal tuo account."}
            </p>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@esempio.it"
              disabled={busy}
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              name="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Almeno 6 caratteri"
              disabled={busy}
            />
          </label>

          {error ? (
            <div className="auth-message auth-message--error" role="alert">
              <Icon name="info" size={16} />
              <p>{error}</p>
            </div>
          ) : null}

          {notice ? (
            <div className="auth-message" role="status">
              <Icon name="check" size={16} />
              <p>{notice}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="button button--primary auth-submit"
            disabled={busy}
          >
            {busy
              ? "Attendi…"
              : mode === "login"
                ? "Accedi"
                : "Crea account"}
          </button>
        </form>

        <p className="auth-privacy">
          <Icon name="lock" size={13} /> Dati separati per account e protetti
          da Row Level Security.
        </p>
      </div>
    </div>
  );
}
