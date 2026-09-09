import { cloudflareBridge } from "@/components/CloudflareWebViewHost";
import { findCloudflareChallenge } from "@/providers/InkDexProvider";

/**
 * Runs `fn`; if it throws a Cloudflare challenge, triggers the global
 * CloudflareWebViewHost to solve it (depositing a `cf_clearance` cookie),
 * then retries `fn` once. Screens/services call this so they never need
 * to know challenges exist. Solve failures are swallowed after logging,
 * so the original challenge error surfaces to the caller.
 */
export async function withCloudflareRetry<T>(
  sourceId: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const challenge = findCloudflareChallenge(err);
    if (!challenge) throw err;

    const challengeUrl = challenge.resolutionRequest?.url ?? challenge.url ?? "";
    try {
      await cloudflareBridge.requestSolve(sourceId, challengeUrl);
    } catch (solveErr) {
      // Challenge couldn't be auto-solved; rethrow the original error.
      (console as Console).warn(
        `[withCloudflareRetry] CF solve failed for ${sourceId}:`,
        solveErr
      );
      throw err;
    }
    return fn();
  }
}
