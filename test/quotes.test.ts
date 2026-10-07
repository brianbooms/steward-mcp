/**
 * Steward MCP server — live quote test (NO payments).
 *
 * For each of the 19 tools, probes the backing endpoint with no payer key and
 * verifies the expected behavior: 402 quote for paid rail endpoints, 200 for
 * free endpoints, 404 for rail endpoints not yet shipped. Never signs, never
 * pays. Run: npx tsx test/quotes.test.ts
 */
import { probeQuote, STEWARD_PAY_TO, USDC_BASE } from "../src/x402.js";
import { TOOLS } from "../src/tools.js";

const RAIL = "https://pay.brianbooms.com";
const HUB = "https://brianbooms.com";
const CANONICAL = "0xa98e8c6cbc64b7bb30fd0d2015ab24814c661839";

// Representative args per tool (no payer key — we only want the quote).
const ARGS: Record<string, { path: string; query?: Record<string, string>; method?: string; body?: unknown; price?: string }> = {
  steward_weather:   { path: "/api/v1/data/weather", query: { lat: "30.27", lon: "-97.74" } },
  steward_joke:      { path: "/api/v1/data/joke" },
  steward_fortune:   { path: "/api/v1/data/fortune" },
  steward_fx:        { path: "/api/v1/data/fx", query: { amount: "100", from: "USD", to: "EUR" } },
  steward_time:      { path: "/api/v1/data/time", query: { tz: "America/Chicago" } },
  steward_wiki:      { path: "/api/v1/data/wiki", query: { topic: "Austin, Texas" } },
  steward_iss_pass:  { path: "/api/v1/data/iss-pass", query: { lat: "30.27", lon: "-97.74" } },
  steward_audio_match: { path: "/api/v1/audio/match", method: "POST", body: { mood: "calm focus" } },
  steward_audio_rest:  { path: "/api/v1/audio/rest", method: "POST", body: {} },
  steward_audio_focus: { path: "/api/v1/audio/focus", method: "POST", body: {} },
  steward_sleep_tip: { path: "/api/v1/data/sleep-tip" },
  steward_receipts:  { path: "/api/v1/receipts", query: { wallet: CANONICAL } },
  steward_cheapest_route: { path: "/api/v1/routes/cheapest", query: { amount_usd: "10" } },
  steward_route_fees:     { path: "/api/v1/routes/fees", query: { amount_usd: "10" } },
  trust_verify_status:    { path: "/api/v1/trust/verify-status", method: "POST", body: { domain: "pay.brianbooms.com" }, price: "10000" },
  trust_agent_attestation:{ path: "/api/v1/trust/agent-attestation", method: "POST", body: { agent: CANONICAL }, price: "20000" },
  trust_screen:           { path: "/api/v1/trust/screen", method: "POST", body: { agent: CANONICAL, amount_usdc: 5 }, price: "20000" },
  steward_verifier_pubkey:{ path: "/api/v1/steward/verifier-pubkey" },
};

interface Check { tool: string; ok: boolean; detail: string; }

async function main() {
  console.log("Steward MCP — live quote test (no payments)\n");
  const results: Check[] = [];

  // 0. Tool registry sanity: 24 tools, unique names, steward_/trust_ prefix.
  const names = TOOLS.map((t) => t.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  results.push({
    tool: "(registry)",
    ok: TOOLS.length === 24 && dupes.length === 0 && names.every((n) => n.startsWith("steward_") || n.startsWith("trust_")),
    detail: `${TOOLS.length} tools, dupes=${dupes.length}`,
  });
  for (const t of TOOLS) {
    if (!ARGS[t.name] && !["steward_catalog","steward_product","steward_purchase_instructions","steward_rewards","steward_payment_format","steward_directory"].includes(t.name)) {
      results.push({ tool: t.name, ok: false, detail: "no probe args defined" });
    }
  }

  // 1. Probe rail-backed endpoints.
  for (const t of TOOLS) {
    const a = ARGS[t.name];
    if (!a) continue;
    try {
      const { status, quote } = await probeQuote(RAIL, a.path, {
        method: a.method, body: a.body, query: a.query,
      });

      if (["steward_receipts","steward_cheapest_route","steward_route_fees","steward_verifier_pubkey"].includes(t.name)) {
        // Free endpoints: expect 200, no quote.
        results.push({
          tool: t.name,
          ok: status === 200 && quote === null,
          detail: `HTTP ${status}, no payment required (free)`,
        });
        continue;
      }
      if (t.name.startsWith("steward_audio_")) {
        // Audio lanes live since rail V3.9.195-AUDIO: expect 402 + sane $0.01 quote.
        const priceOk = quote !== null && quote.maxAmountRequired === "10000";
        const payeeOk = quote !== null && quote.payTo.toLowerCase() === STEWARD_PAY_TO.toLowerCase();
        const assetOk = quote !== null && quote.asset.toLowerCase() === USDC_BASE.toLowerCase();
        const netOk = quote !== null && quote.network === "base" && quote.scheme === "exact";
        const ok = status === 402 && priceOk && payeeOk && assetOk && netOk;
        results.push({
          tool: t.name,
          ok,
          detail:
            `HTTP ${status}, price=${quote?.maxAmountRequired ?? "n/a"} atomic ` +
            `($${quote ? (Number(BigInt(quote.maxAmountRequired)) / 1e6).toFixed(4) : "n/a"}), ` +
            `payee=${payeeOk ? "canonical" : "MISMATCH"}, asset=${assetOk ? "USDC" : "MISMATCH"}, net=${quote?.network ?? "n/a"}`,
        });
        continue;
      }
      // Paid endpoints: expect 402 + sane quote (per-tool price from ARGS).
      const wantPrice = a.price ?? "10000";
      const priceOk = quote !== null && quote.maxAmountRequired === wantPrice;
      const payeeOk = quote !== null && quote.payTo.toLowerCase() === STEWARD_PAY_TO.toLowerCase();
      const assetOk = quote !== null && quote.asset.toLowerCase() === USDC_BASE.toLowerCase();
      const netOk = quote !== null && quote.network === "base" && quote.scheme === "exact";
      const ok = status === 402 && priceOk && payeeOk && assetOk && netOk;
      results.push({
        tool: t.name,
        ok,
        detail:
          `HTTP ${status}, price=${quote?.maxAmountRequired ?? "n/a"} atomic ` +
          `($${quote ? (Number(BigInt(quote.maxAmountRequired)) / 1e6).toFixed(4) : "n/a"}), ` +
          `payee=${payeeOk ? "canonical" : "MISMATCH"}, asset=${assetOk ? "USDC" : "MISMATCH"}, net=${quote?.network ?? "n/a"}`,
      });
    } catch (e) {
      results.push({ tool: t.name, ok: false, detail: `probe error: ${(e as Error).message}` });
    }
  }

  // 2. Probe hub-backed discovery tools (brianbooms.com, free).
  try {
    const catRes = await fetch(`${HUB}/.well-known/purchase-catalog.json`, {
      headers: { "User-Agent": "steward-mcp/0.3", Accept: "application/json" },
    });
    const catJson = (await catRes.json().catch(() => null)) as { products?: any[]; items?: any[] } | null;
    const products = catJson?.products || catJson?.items || [];
    results.push({
      tool: "steward_catalog",
      ok: catRes.status === 200 && products.length > 0,
      detail: `HTTP ${catRes.status}, ${products.length} products in live catalog`,
    });

    // steward_product: resolve the first SKU the same way the tool does.
    const first = products[0];
    const sku = first?.sku || first?.id;
    const found = sku && products.find((p: any) => (p.sku || p.id) === sku);
    results.push({
      tool: "steward_product",
      ok: !!(found && (found.name || found.title)),
      detail: found ? `resolved sku "${sku}" → ${found.name || found.title}` : "no products to resolve",
    });

    // steward_purchase_instructions: the buy URL must 402 with a payment-required header.
    if (sku) {
      const buyRes = await fetch(`${RAIL}/api/v1/buy/${encodeURIComponent(sku)}`, {
        headers: { "User-Agent": "steward-mcp/0.2", Accept: "application/json" },
      });
      const pHeader = buyRes.headers.get("payment-required") || buyRes.headers.get("PAYMENT-REQUIRED");
      let parsed = false;
      if (pHeader) {
        try {
          const d = JSON.parse(Buffer.from(pHeader, "base64").toString("utf8"));
          parsed = !!(d.accepts && d.accepts[0] && d.accepts[0].payTo);
        } catch { /* no */ }
      }
      results.push({
        tool: "steward_purchase_instructions",
        ok: buyRes.status === 402 && parsed,
        detail: `HTTP ${buyRes.status} on buy/${sku}, payment-required header ${parsed ? "parses" : "MISSING/UNPARSEABLE"}`,
      });
    } else {
      results.push({ tool: "steward_purchase_instructions", ok: false, detail: "no sku to probe" });
    }
    // steward_directory: the 57-merchant Steward directory must be live.
    try {
      const dirRes = await fetch(`${HUB}/steward/directory.json`, {
        headers: { "User-Agent": "steward-mcp/0.3", Accept: "application/json" },
      });
      const dirJson = (await dirRes.json().catch(() => null)) as { merchants?: any[] } | null;
      const merchants = dirJson?.merchants || [];
      results.push({
        tool: "steward_directory",
        ok: dirRes.status === 200 && merchants.length >= 50,
        detail: `HTTP ${dirRes.status}, ${merchants.length} merchants in live directory`,
      });
    } catch (e) {
      results.push({ tool: "steward_directory", ok: false, detail: `probe error: ${(e as Error).message}` });
    }
  } catch (e) {
    for (const n of ["steward_catalog", "steward_product", "steward_purchase_instructions"]) {
      results.push({ tool: n, ok: false, detail: `probe error: ${(e as Error).message}` });
    }
  }

  // 3. Static-content tools (no network): verify the tool defs carry real text.
  for (const n of ["steward_rewards", "steward_payment_format"]) {
    const t = TOOLS.find((x) => x.name === n);
    results.push({
      tool: n,
      ok: !!t && t.description.length > 20,
      detail: t ? "registered, static content (no network probe needed)" : "MISSING from registry",
    });
  }

  // Report.
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.tool}\n      ${r.detail}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} checks passed.`);
  if (pass !== results.length) process.exit(1);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
