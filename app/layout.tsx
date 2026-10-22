import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { appVersion } from "@/lib/app-version";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Balance — Budgeting, made simple.",
    template: "%s · Balance",
  },
  description:
    "Movimenti, budget e patrimonio. I tuoi dati finanziari, privati nel tuo account.",
  applicationName: "Balance",
  appleWebApp: {
    capable: true,
    title: "Balance",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "balance-build": appVersion(),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f4ec",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
