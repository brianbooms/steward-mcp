/**
 * Steward MCP Server — configuration.
 *
 * All secrets come from the environment. Nothing is stored, logged, or
 * transmitted except the per-call EIP-3009 authorization the user's own
 * key signs. The payer key never leaves the user's machine.
 */

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Steward: missing required env var ${name}. ` +
        `Set it to your Base USDC payer private key (0x...). ` +
        `See README.md for setup.`
    );
  }
  return v.trim();
}

function optionalFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface StewardConfig {
  /** Hex private key of the payer wallet (0x...). Used only to sign per-call authorizations. */
  payerKey: string;
  /** Hard ceiling per single tool call, in USDC. Default 0.05. */
  maxSpendPerCallUsdc: number;
  /** Hard ceiling per 24h rolling window, in USDC. Default 5.00. */
  maxSpendPerDayUsdc: number;
  /** Base URL of the Steward rail. */
  railBaseUrl: string;
}

export function loadConfig(): StewardConfig {
  return {
    payerKey: requiredEnv("STEWARD_PAYER_KEY"),
    maxSpendPerCallUsdc: optionalFloat("STEWARD_MAX_SPEND_USDC", 0.05),
    maxSpendPerDayUsdc: optionalFloat("STEWARD_MAX_SPEND_DAY_USDC", 5.0),
    railBaseUrl: (process.env.STEWARD_RAIL_URL || "https://pay.brianbooms.com").replace(/\/$/, ""),
  };
}

/**
 * In-memory rolling spend ledger (per process). Keys are ISO day strings.
 * This is a safety rail, not accounting — the rail's receipts endpoint
 * (steward_receipts) is the source of truth for settled spend.
 */
const spendLedger = new Map<string, number>();

export function recordSpend(usdc: number): void {
  const day = new Date().toISOString().slice(0, 10);
  spendLedger.set(day, (spendLedger.get(day) ?? 0) + usdc);
}

export function spentTodayUsdc(): number {
  const day = new Date().toISOString().slice(0, 10);
  return spendLedger.get(day) ?? 0;
}

export function checkSpendCaps(cfg: StewardConfig, callUsdc: number): void {
  if (callUsdc > cfg.maxSpendPerCallUsdc) {
    throw new Error(
      `Steward: call price $${callUsdc.toFixed(4)} exceeds per-call cap ` +
        `$${cfg.maxSpendPerCallUsdc.toFixed(4)} (STEWARD_MAX_SPEND_USDC). Refusing to pay.`
    );
  }
  const today = spentTodayUsdc();
  if (today + callUsdc > cfg.maxSpendPerDayUsdc) {
    throw new Error(
      `Steward: this call would take today's spend to $${(today + callUsdc).toFixed(2)}, ` +
        `over the daily cap $${cfg.maxSpendPerDayUsdc.toFixed(2)} (STEWARD_MAX_SPEND_DAY_USDC). Refusing to pay.`
    );
  }
}
