import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appVersion } from "../lib/app-version";
import {
  MAX_VERSION_RELOADS,
  VERSION_RELOAD_KEY,
  planVersionReload,
  readVersionReloadState,
} from "../lib/pwa";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

describe("app version", () => {
  const original = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA,
    deployment: process.env.VERCEL_DEPLOYMENT_ID,
  };

  beforeEach(() => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterEach(() => {
    if (original.sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = original.sha;
    if (original.deployment === undefined) {
      delete process.env.VERCEL_DEPLOYMENT_ID;
    } else {
      process.env.VERCEL_DEPLOYMENT_ID = original.deployment;
    }
  });

  it("returns dev outside Vercel", () => {
    expect(appVersion()).toBe("dev");
  });

  it("prefers the commit SHA and keeps it short", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef";
    expect(appVersion()).toBe("abcdef1234567890");
  });

  it("falls back to the deployment id", () => {
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_1234567890abcdef";
    expect(appVersion()).toBe("dpl_1234567890ab");
  });
});

describe("version reload planning", () => {
  it("ignores dev and empty versions", () => {
    expect(planVersionReload(null, "dev")).toEqual({
      reload: false,
      state: null,
    });
    expect(planVersionReload(null, "")).toEqual({ reload: false, state: null });
  });

  it("reloads once per new version and records attempts", () => {
    const first = planVersionReload(null, "v2");
    expect(first.reload).toBe(true);
    expect(first.state).toEqual({ version: "v2", attempts: 1 });

    const second = planVersionReload(JSON.stringify(first.state), "v2");
    expect(second.reload).toBe(true);
    expect(second.state).toEqual({ version: "v2", attempts: 2 });
  });

  it(`stops after ${MAX_VERSION_RELOADS} attempts for the same version`, () => {
    const exhausted = JSON.stringify({
      version: "v2",
      attempts: MAX_VERSION_RELOADS,
    });
    const plan = planVersionReload(exhausted, "v2");
    expect(plan.reload).toBe(false);
    expect(plan.state).toEqual({
      version: "v2",
      attempts: MAX_VERSION_RELOADS,
    });
  });

  it("resets attempts when the target version changes", () => {
    const previous = JSON.stringify({
      version: "v2",
      attempts: MAX_VERSION_RELOADS,
    });
    const plan = planVersionReload(previous, "v3");
    expect(plan.reload).toBe(true);
    expect(plan.state).toEqual({ version: "v3", attempts: 1 });
  });

  it("ignores malformed reload state instead of looping", () => {
    expect(planVersionReload("not-json", "v2")).toEqual({
      reload: true,
      state: { version: "v2", attempts: 1 },
    });
    expect(readVersionReloadState("not-json")).toBeNull();
    expect(readVersionReloadState('{"version":"v2"}')).toBeNull();
  });
});

describe("service worker update strategy", () => {
  const sw = read("public/sw.js");

  it("uses a new versioned cache set", () => {
    expect(sw).toContain('const VERSION = "3"');
    expect(sw).toContain("balance-shell-${VERSION}");
    expect(sw).toContain("balance-assets-${VERSION}");
    expect(sw).toContain("balance-documents-${VERSION}");
  });

  it("fetches navigations from the network without the HTTP cache", () => {
    expect(sw).toContain("networkFirstDocument");
    expect(sw).toContain('fetch(request, { cache: "no-store" })');
    expect(sw).toContain('request.mode === "navigate"');
  });

  it("never intercepts or caches API/auth traffic", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('url.pathname.startsWith("/auth/")');
    expect(sw).toContain('url.pathname === "/sw.js"');
    expect(sw).toContain("if (!isSameOrigin(url) || isBypassed(url)) return;");
  });

  it("keeps only hash-versioned build assets cache-first", () => {
    expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
    expect(sw).toContain("cacheFirstAsset");
  });

  it("activates immediately and prunes obsolete Balance caches", () => {
    expect(sw).toContain("await self.skipWaiting()");
    expect(sw).toContain("await self.clients.claim()");
    expect(sw).toContain("!CURRENT_CACHES.has(key)");
    expect(sw).toContain("caches.delete(key)");
  });

  it("reloads open windows once after an update, not on first install", () => {
    expect(sw).toContain('if (firstInstall) return;');
    expect(sw).toContain("await client.navigate(client.url)");
    expect(sw).toContain('data.type === "SKIP_WAITING"');
  });

  it("keeps a document fallback for offline launches", () => {
    expect(sw).toContain("DOCUMENT_CACHE");
    expect(sw).toContain("OFFLINE_HTML");
    expect(sw).toContain("cache.match(DOCUMENT_KEY)");
  });
});

describe("service worker registration", () => {
  const source = read("components/ServiceWorkerRegister.tsx");

  it("bypasses the HTTP cache when checking for a new worker", () => {
    expect(source).toContain('updateViaCache: "none"');
    expect(source).toContain("registration.update()");
  });

  it("checks for updates when the PWA becomes visible again", () => {
    expect(source).toContain('addEventListener("visibilitychange"');
    expect(source).toContain('addEventListener("pageshow"');
    expect(source).toContain('addEventListener("online"');
    expect(source).toContain("checkForServiceWorkerUpdate");
  });

  it("activates waiting workers and reloads only when already controlled", () => {
    expect(source).toContain('type: "SKIP_WAITING"');
    expect(source).toContain('"controllerchange"');
    expect(source).toContain("handleControllerChange");
    expect(source).toContain("if (!hadController || controllerReloaded) return;");
  });

  it("detects a newer deployment through the version route", () => {
    expect(source).toContain('balance-build');
    expect(source).toContain('fetch("/api/version", { cache: "no-store" })');
    expect(source).toContain("planVersionReload");
    expect(source).toContain("pendingVersion");
  });

  it("does not reload while the user is busy", () => {
    expect(source).toContain("canAutoReload");
    expect(source).toContain('role="dialog"');
  });

  it("imports the shared reload guard", () => {
    expect(source).toContain("VERSION_RELOAD_KEY");
    expect(VERSION_RELOAD_KEY).toBe("balance:version-reload");
  });
});

describe("deployment version wiring", () => {
  it("embeds the build version in the document", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('"balance-build": appVersion()');
  });

  it("serves the version route without caching", () => {
    const route = read("app/api/version/route.ts");
    expect(route).toContain("appVersion()");
    expect(route).toContain("no-store");
  });

  it("disables caching for sw.js and revalidates the manifest", () => {
    const config = read("next.config.ts");
    expect(config).toContain('source: "/sw.js"');
    expect(config).toContain("no-cache, no-store, must-revalidate");
    expect(config).toContain('"Service-Worker-Allowed"');
    expect(config).toContain('source: "/manifest.webmanifest"');
  });
});
