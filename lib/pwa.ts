export const VERSION_RELOAD_KEY = "balance:version-reload";

/** A deployment may force at most two automatic reloads before giving up. */
export const MAX_VERSION_RELOADS = 2;

export type VersionReloadState = {
  version: string;
  attempts: number;
};

export function readVersionReloadState(
  raw: string | null,
): VersionReloadState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<VersionReloadState>;
    if (typeof parsed.version !== "string" || !parsed.version) return null;
    if (typeof parsed.attempts !== "number" || !Number.isFinite(parsed.attempts)) {
      return null;
    }
    return {
      version: parsed.version,
      attempts: Math.max(0, Math.floor(parsed.attempts)),
    };
  } catch {
    return null;
  }
}

/**
 * Decides whether the page should reload to pick up a newer deployment.
 * The attempt counter is stored per version so a stale HTML response can
 * never trap the app in a reload loop.
 */
export function planVersionReload(
  raw: string | null,
  latestVersion: string,
): { reload: boolean; state: VersionReloadState | null } {
  if (!latestVersion || latestVersion === "dev") {
    return { reload: false, state: null };
  }

  const previous = readVersionReloadState(raw);
  const attempts =
    previous?.version === latestVersion ? previous.attempts : 0;

  if (attempts >= MAX_VERSION_RELOADS) {
    return { reload: false, state: { version: latestVersion, attempts } };
  }

  return {
    reload: true,
    state: { version: latestVersion, attempts: attempts + 1 },
  };
}
