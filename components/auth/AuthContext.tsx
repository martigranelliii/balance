"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface AuthSessionValue {
  email: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthSessionValue | null>(null);

export function AuthProvider({
  value,
  children,
}: {
  value: AuthSessionValue;
  children: ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthSessionValue | null {
  return useContext(AuthContext);
}
