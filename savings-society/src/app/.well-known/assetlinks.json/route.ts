/**
 * Digital Asset Links for the Android app (a Trusted Web Activity built with
 * Bubblewrap, see DEPLOY.md → Android app). Set ANDROID_PACKAGE (e.g.
 * org.dreamhive.app) and ANDROID_SHA256 (the signing key fingerprint, from
 * `bubblewrap fingerprint` or the Play Console) so the app opens full-screen.
 */
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE;
  const fingerprints = (process.env.ANDROID_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!pkg || fingerprints.length === 0) return Response.json([]);
  return Response.json([
    { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints } },
  ]);
}
