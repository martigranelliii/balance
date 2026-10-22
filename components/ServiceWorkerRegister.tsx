"use client";

import { useEffect } from "react";
import {
  VERSION_RELOAD_KEY,
  planVersionReload,
} from "@/lib/pwa";

const SW_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const RELOAD_RETRY_MS = 60 * 1000;

function readBuildVersion(): string {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="balance-build"]',
  );
  return meta?.content?.trim() ?? "";
}

/**
 * Avoid yanking the page away while the user is typing or has a sheet open.
 * Updates are applied as soon as the app is idle again.
 */
function canAutoReload(): boolean {
  if (document.visibilityState !== "visible") return false;
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) {
    return false;
  }

  const active = document.activeElement as HTMLElement | null;
  if (!active) return true;

  return !(
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    active.tagName === "SELECT" ||
    active.isContentEditable
  );
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | null = null;
    let disposed = false;
    let lastSwUpdateCheck = 0;
    let controllerReloaded = false;
    let pendingVersion: string | null = null;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    const requestReload = () => {
      if (!pendingVersion || disposed) return;
      if (!canAutoReload()) {
        if (!reloadTimer) {
          reloadTimer = setTimeout(() => {
            reloadTimer = undefined;
            requestReload();
          }, RELOAD_RETRY_MS);
        }
        return;
      }

      const plan = planVersionReload(
        sessionStorage.getItem(VERSION_RELOAD_KEY),
        pendingVersion,
      );
      if (!plan.reload || !plan.state) {
        pendingVersion = null;
        return;
      }

      try {
        sessionStorage.setItem(VERSION_RELOAD_KEY, JSON.stringify(plan.state));
      } catch {
        // Storage can be unavailable in private contexts; reload once anyway.
      }
      window.location.reload();
    };

    const checkAppVersion = async () => {
      const current = readBuildVersion();
      if (!current || current === "dev") return;

      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok || disposed) return;

        const payload = (await response.json()) as { version?: unknown };
        const latest =
          typeof payload.version === "string"
            ? payload.version.trim()
            : "";

        if (!latest || latest === "dev" || latest === current) return;
        pendingVersion = latest;
        requestReload();
      } catch {
        // Offline or transient failure: try again on the next check.
      }
    };

    const checkForServiceWorkerUpdate = (force = false) => {
      if (!registration || disposed) return;
      const now = Date.now();
      if (!force && now - lastSwUpdateCheck < SW_UPDATE_INTERVAL_MS) return;
      lastSwUpdateCheck = now;
      registration.update().catch(() => {});
    };

    const warmShell = async () => {
      try {
        const ready = await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => {
            try {
              const parsed = new URL(url);
              return (
                parsed.origin === window.location.origin &&
                parsed.pathname.startsWith("/_next/static/")
              );
            } catch {
              return false;
            }
          });
        ready.active?.postMessage({
          type: "CACHE_URLS",
          urls: [...new Set(urls)],
        });
      } catch {
        // Offline caching is an enhancement; the app keeps working without it.
      }
    };

    const handleControllerChange = () => {
      if (!hadController || controllerReloaded) return;
      controllerReloaded = true;
      window.location.reload();
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (disposed) return;

        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        await navigator.serviceWorker.ready;
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });

        checkForServiceWorkerUpdate(true);
        await warmShell();
      } catch {
        // The app remains usable; offline support is progressive.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      checkForServiceWorkerUpdate();
      void checkAppVersion();
      requestReload();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      checkForServiceWorkerUpdate();
      void checkAppVersion();
      requestReload();
    };

    const onOnline = () => {
      checkForServiceWorkerUpdate(true);
      void checkAppVersion();
      requestReload();
    };

    const swTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        checkForServiceWorkerUpdate();
      }
    }, SW_UPDATE_INTERVAL_MS);

    const versionTimer = setInterval(() => {
      if (document.visibilityState === "visible") void checkAppVersion();
    }, VERSION_CHECK_INTERVAL_MS);

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    void register();
    void checkAppVersion();

    return () => {
      disposed = true;
      clearInterval(swTimer);
      clearInterval(versionTimer);
      if (reloadTimer) clearTimeout(reloadTimer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
