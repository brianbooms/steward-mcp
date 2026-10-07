/**
 * Steward MCP Server — x402 payment handler (EVM "exact" scheme, Base USDC).
 *
 * Flow per tool call:
 *   1. Request the rail endpoint with no payment.
 *   2. Rail answers 402 with an `accepts[]` quote (x402 v1).
 *   3. We verify the quote (network=base, scheme=exact, sane price, expected payee),
 *      enforce the user's spend caps, then sign an EIP-3009
 *      `transferWithAuthorization` with the user's own payer key.
 *   4. Resubmit with the `X-PAYMENT` header carrying the signed authorization.
 *   5. Rail verifies via its facilitator and returns the 200 payload.
 *
 * The payer key is used only for signing. It is never logged, stored, or sent
 * anywhere except inside the signed authorization destined for the rail.
 */

import {
  createWalletClient,
  http,
  type Hex,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  checkSpendCaps,
  recordSpend,
  type StewardConfig,
} from "./config.js";

/** Canonical Steward receive wallet. Never change without Brian's tap. */
export const STEWARD_PAY_TO = "0xa98e8c6cbc64b7bb30fd0d2015ab24814c661839";
/** USDC on Base. */
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

export interface X402Quote {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  resource: string;
  description: string;
  extra?: { name?: string; version?: string };
}

interface Authorization {
  from: Hex;
  to: Hex;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

function atomicToUsdc(atomic: string): number {
  return Number(BigInt(atomic)) / 10 ** USDC_DECIMALS;
}

function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Verify the rail's 402 quote is sane and matches what we expect from Steward.
 * Throws on anything unexpected — we never sign a quote we don't understand.
 */
export function verifyQuote(q: X402Quote, cfg: StewardConfig): number {
  if (q.scheme !== "exact") {
    throw new Error(`Steward: unsupported x402 scheme "${q.scheme}" (expected "exact").`);
  }
  if (q.network !== "base") {
    throw new Error(`Steward: unexpected network "${q.network}" (expected "base").`);
  }
  if (q.payTo.toLowerCase() !== STEWARD_PAY_TO.toLowerCase()) {
    throw new Error(
      `Steward: quote payee ${q.payTo} is not the Steward wallet. Refusing to pay.`
    );
  }
  if (q.asset.toLowerCase() !== USDC_BASE.toLowerCase()) {
    throw new Error(`Steward: unexpected asset ${q.asset} (expected USDC on Base).`);
  }
  const usdc = atomicToUsdc(q.maxAmountRequired);
  if (!Number.isFinite(usdc) || usdc <= 0 || usdc > 1) {
    throw new Error(`Steward: insane quote price $${String(usdc)} — refusing to pay.`);
  }
  checkSpendCaps(cfg, usdc);
  return usdc;
}

/** Sign the EIP-3009 authorization for a verified quote. */
async function signAuthorization(
  cfg: StewardConfig,
  q: X402Quote
): Promise<{ authorization: Authorization; signature: Hex }> {
  const account = privateKeyToAccount(cfg.payerKey as Hex);
  const client = createWalletClient({ account, chain: base, transport: http() });

  const nowSec = Math.floor(Date.now() / 1000);
  const timeout = Number.isFinite(q.maxTimeoutSeconds) && q.maxTimeoutSeconds > 0
    ? q.maxTimeoutSeconds
    : 300;

  const authorization: Authorization = {
    from: account.address,
    to: q.payTo as Hex,
    value: q.maxAmountRequired,
    validAfter: String(nowSec - 60),
    validBefore: String(nowSec + timeout),
    nonce: randomNonce(),
  };

  const signature = await client.signTypedData({
    domain: {
      name: q.extra?.name ?? "USD Coin",
      version: q.extra?.version ?? "2",
      chainId: base.id,
      verifyingContract: q.asset as Hex,
    },
    types: EIP3009_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  return { authorization, signature };
}

function encodePaymentPayload(
  q: X402Quote,
  authorization: Authorization,
  signature: Hex
): string {
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: q.network,
    payload: { signature, authorization },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export interface RailResult {
  ok: boolean;
  status: number;
  /** Parsed JSON body when the rail returned JSON. */
  json: unknown;
  /** Price actually quoted, in USDC (0 when no payment was needed). */
  paidUsdc: number;
}

/**
 * Call a rail endpoint, completing the x402 payment dance automatically.
 * Returns the rail's JSON body. Throws with a clear message on any failure.
 */
export async function callRail(
  cfg: StewardConfig,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> }
): Promise<RailResult> {
  const method = init?.method ?? "GET";
  const url = new URL(cfg.railBaseUrl + path);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }

  const doFetch = (paymentHeader?: string) =>
    fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(paymentHeader ? { "X-PAYMENT": paymentHeader } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  // 1. Try without payment (free endpoints, e.g. receipts).
  let res = await doFetch();
  if (res.status !== 402) {
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json, paidUsdc: 0 };
  }

  // 2. Parse and verify the 402 quote.
  const challenge = (await res.json().catch(() => null)) as {
    accepts?: X402Quote[];
  } | null;
  const quote = challenge?.accepts?.[0];
  if (!quote) {
    throw new Error("Steward: rail returned 402 without a usable payment quote.");
  }
  const usdc = verifyQuote(quote, cfg);

  // 3. Sign and resubmit.
  const { authorization, signature } = await signAuthorization(cfg, quote);
  const paymentHeader = encodePaymentPayload(quote, authorization, signature);
  res = await doFetch(paymentHeader);

  if (res.status === 402) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Steward: payment rejected by rail (still 402 after signing). ${detail.slice(0, 200)}`
    );
  }
  const json = await res.json().catch(() => null);
  if (res.ok) recordSpend(usdc);
  return { ok: res.ok, status: res.status, json, paidUsdc: res.ok ? usdc : 0 };
}

/**
 * Quote-only probe: fetch the endpoint with no key and return the 402 quote.
 * Used by tests — never signs, never pays.
 */
export async function probeQuote(
  railBaseUrl: string,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string> }
): Promise<{ status: number; quote: X402Quote | null; raw: unknown }> {
  const method = init?.method ?? "GET";
  const url = new URL(railBaseUrl + path);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const raw = (await res.json().catch(() => null)) as { accepts?: X402Quote[] } | null;
  return { status: res.status, quote: raw?.accepts?.[0] ?? null, raw };
}
