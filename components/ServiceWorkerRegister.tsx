"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const warmShell = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => {
            try {
              const parsed = new URL(url);
              return (
                parsed.origin === window.location.origin &&
                (parsed.pathname.startsWith("/_next/static/") ||
                  parsed.pathname.startsWith("/icons/"))
              );
            } catch {
              return false;
            }
          });
        registration.active?.postMessage({
          type: "CACHE_URLS",
          urls: [...new Set(urls)],
        });
      } catch {
        // The app remains fully usable; offline reload is an enhancement.
      }
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(warmShell)
        .catch(() => {
          // Offline shell is an enhancement; the journal still works without it.
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
