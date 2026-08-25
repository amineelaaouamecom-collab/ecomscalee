import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Keep a standalone worker .env for VPS deployments, but make local development
// reuse the existing Ecom OS root .env like the previous worker did.
loadEnv({ path: resolve(workerRoot, ".env"), quiet: true });
loadEnv({ path: resolve(workerRoot, "..", ".env"), override: false, quiet: true });

const localDevelopment = process.env.NODE_ENV !== "production" && process.env.npm_lifecycle_event === "dev";

function first(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function required(names) {
  const candidates = Array.isArray(names) ? names : [names];
  const value = first(...candidates);
  if (!value) throw new Error(`${candidates.join(" or ")} is required`);
  return value;
}

const configuredApiSecret = first("WORKER_API_SECRET");
if (!configuredApiSecret && localDevelopment) {
  console.warn("[worker] WORKER_API_SECRET is not set; using the legacy local development secret");
}

export const config = Object.freeze({
  supabaseUrl: required(["SUPABASE_URL", "VITE_SUPABASE_URL"]),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  apiSecret: configuredApiSecret || (localDevelopment ? "dev-secret" : required("WORKER_API_SECRET")),
  host: first("WORKER_HOST") || (!configuredApiSecret && localDevelopment ? "127.0.0.1" : "0.0.0.0"),
  port: Number(process.env.WORKER_PORT || 5000),
  sessionPath: process.env.SESSION_STORAGE_PATH || "./sessions",
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,
  version: "2.0.0",
  pollMs: Math.max(1000, Number(process.env.QUEUE_POLL_MS || 3000)),
  // Claim one at a time so the per-workspace minimum interval is enforced.
  claimLimit: 1,
});
