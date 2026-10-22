/**
 * Build/deployment identifier used to detect when an already-open PWA is
 * running an older deployment than the one currently served.
 *
 * On Vercel the commit SHA (or deployment id) is available both during the
 * build (baked into the HTML meta tag) and at request time (version route).
 * Outside Vercel every build is `dev`, which disables the automatic reload
 * and keeps local development predictable.
 */
export function appVersion(): string {
  const raw =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim();

  return raw ? raw.slice(0, 16) : "dev";
}
