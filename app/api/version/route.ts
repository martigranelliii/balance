import { appVersion } from "@/lib/app-version";

/**
 * Exposes the deployment identifier so an already-open PWA can detect that a
 * newer version is live.
 *
 * This route is prerendered with the rest of the deployment, exactly like the
 * `balance-build` meta tag, so the two values always describe the same build.
 * The response itself must never be cached by browsers or intermediaries.
 */
export function GET(): Response {
  return Response.json(
    { version: appVersion() },
    { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
  );
}
