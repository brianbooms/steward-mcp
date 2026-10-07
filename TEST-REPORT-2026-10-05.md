# Steward MCP Server — Test Report

**Date:** 2026-10-05 · **Rail:** https://pay.brianbooms.com · **Build:** V3.9.191-TIERED
**Method:** live quote probes (no payer key, no signatures, no payments) + MCP stdio smoke test.
**Version:** 0.2.0 — consolidation release (all Steward MCP servers merged into one).

## Consolidation

Per Brian's tap 2026-10-05 ~21:37 CDT, all existing MCP servers were merged
into this one canonical package (`@brianbooms/steward-mcp`). Tool provenance:

| Ported tool | Source server | Notes |
|---|---|---|
| steward_catalog | brianbooms-mcp v1.1.1 (`catalog`) | Live purchase-catalog.json, 29 products, 10-min cache |
| steward_product | brianbooms-mcp v1.1.1 (`product`) | SKU lookup + buy URL |
| steward_purchase_instructions | brianbooms-mcp v1.1.1 (`purchase_instructions`) | Live 402 parse, free (reads, never pays) |
| steward_rewards | brianbooms-mcp v1.1.1 (`rewards`) | Static Booms Rewards copy |
| steward_payment_format | brianbooms-mcp v1.1.1 (`payment_format`) | Static X-PAYMENT construction guide |
| steward_cheapest_route | boomie-fee-oracle v1.0.0 (`cheapest_route`) | Free, thin passthrough to live Fee Oracle API |
| steward_route_fees | boomie-fee-oracle v1.0.0 (`route_fees`) | Free, thin passthrough to live Fee Oracle API |

Superseded, **not** ported (directories left in place, documented in README):
- `ops/su-store/mcp/` — frozen 3-product Stripe catalog deduped by live
  steward_catalog; `create_checkout_session` / `get_order_status` are
  Stripe-rail tools, superseded by the x402 buy flow.
- `ops/mcp/synthetic-universe/` — stage-only; its tools duplicate the base
  paid set (this server's are the payment-capable versions).
- `ops/mcp/brianbooms-mcp*` variants (py, github, 1.0.4-staged, 1.0.5-build,
  npm v1.0.7) — replaced by the steward_-prefixed ports above.

## Quote test (`npx tsx test/quotes.test.ts`) — 20/20 PASS

| Tool | Result | Detail |
|---|---|---|
| steward_weather | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_joke | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_fortune | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_fx | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_time | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_wiki | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_iss_pass | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_audio_match | PASS* | 404 — rail endpoint not live yet |
| steward_audio_rest | PASS* | 404 — rail endpoint not live yet |
| steward_audio_focus | PASS* | 404 — rail endpoint not live yet |
| steward_sleep_tip | PASS | 402, $0.0100, canonical payee, USDC/Base |
| steward_receipts | PASS | 200 free, no payment required |
| steward_cheapest_route | PASS | 200 free, no payment required |
| steward_route_fees | PASS | 200 free, no payment required |
| steward_catalog | PASS | 200, 29 products in live catalog |
| steward_product | PASS | resolved sku "wallpaper-pack-vol1" |
| steward_purchase_instructions | PASS | 402 on buy/wallpaper-pack-vol1, payment-required header parses |
| steward_rewards | PASS | registered, static content |
| steward_payment_format | PASS | registered, static content |
| (registry) | PASS | 19 tools, no dupes, steward_* prefix |

*Audio tools are defined per the approved scope; they return the rail's honest
404 until the rail ships those endpoints, then activate with no MCP changes.

Every paid quote verified: scheme=exact, network=base, payee=
0xa98e8c6cbc64b7bb30fd0d2015ab24814c661839, asset=USDC on Base
(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913).

## MCP smoke test (`npx tsx test/smoke.test.ts`) — PASS

- Server boots over stdio, lists 20 tools (19 + steward_spend_today).
- `steward_spend_today` returns local meter ($0.00, no calls made).

## Payment handler

`src/x402.ts` implements the full exact-scheme flow (402 → verify quote →
EIP-3009 sign → X-PAYMENT → 200) with payee/asset/network verification and
per-call + daily spend caps. Not executed against real funds in this test
(no funded payer key in test env) — settled-payment E2E awaits Brian's funded-wallet tap.

## Not published

Nothing published to npm — awaiting Brian's separate tap. Package is
`@brianbooms/steward-mcp` 0.2.0, ready for the standing npm process.
