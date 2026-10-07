# Steward MCP Server

Steward's x402 pay-per-call rail as [MCP](https://modelcontextprotocol.io/) tools.
Any MCP-compatible agent (Claude, Cursor, Windsurf, MCP-aware frameworks) gets
Steward's catalog natively in its tool list — each paid call settles **$0.01 USDC
on Base**, signed by your own wallet.

Steward is the machine Brian Booms named: it quotes fair prices, verifies payment
cryptographically, delivers goods, and accounts for every cent.

- Rail: https://pay.brianbooms.com · Build V3.9.203-STANDARD
- Fair Dealing (the terms): https://brianbooms.com/fair-dealing/
- Brian Booms is an AI-assisted artist and content creator.

## Tools (25 total — one canonical server)

### Paid calls — USDC on Base each, settled from your wallet

| Tool | What it does | Price |
|---|---|---|
| `steward_weather` | Current weather + 7-day forecast for lat/lon | $0.01 |
| `steward_joke` | One clean original joke | $0.01 |
| `steward_fortune` | One warm original fortune + lucky number | $0.01 |
| `steward_fx` | Fiat currency conversion at reference rates | $0.01 |
| `steward_time` | Current local time in any IANA time zone | $0.01 |
| `steward_wiki` | Concise Wikipedia summary for a topic | $0.01 |
| `steward_iss_pass` | Upcoming visible ISS flyovers for lat/lon | $0.01 |
| `steward_audio_match` | Match an emotion/moment to a Brian Booms track | $0.01 |
| `steward_audio_rest` | Wind-down audio lane | $0.01 |
| `steward_audio_focus` | Focus audio lane | $0.01 |
| `steward_sleep_tip` | One genuine sleep-hygiene tip (no medical claims) | $0.01 |
| `trust_verify_status` | Is a domain Steward Verified? Status + method + expiry | $0.01 |
| `trust_agent_attestation` | Attestation signals for an agent wallet/identifier | $0.02 |
| `trust_screen` | Pre-payment counterparty screen (approve/review/decline, advisory) | $0.02 |

> The three `steward_audio_*` lanes are live rail-side since worker V3.9.195-AUDIO.
> The three `trust_*` tools are live rail-side since worker V3.9.203-STANDARD.
> All trust tools are read-only and advisory — verification can never be purchased.

### Read-only discovery — free, never signs or spends

| Tool | What it does | Source |
|---|---|---|
| `steward_catalog` | Live purchase catalog: sku, name, USD price (29 products) | brianbooms-mcp |
| `steward_product` | Full details for one SKU: description, price, delivery, buy URL | brianbooms-mcp |
| `steward_purchase_instructions` | Exact x402 payment requirements parsed live from the product's 402 | brianbooms-mcp |
| `steward_rewards` | How Booms Rewards works (buyers + merchants + agent enrollment) | brianbooms-mcp |
| `steward_payment_format` | Byte-exact X-PAYMENT header construction guide | brianbooms-mcp |
| `steward_cheapest_route` | Cheapest of 6 crypto transfer routes for an amount (live fees) | boomie-fee-oracle |
| `steward_route_fees` | Full ranked fee table for all 6 routes | boomie-fee-oracle |
| `steward_receipts` | Public per-wallet receipts — every cent, in the open | base build |
| `steward_verifier_pubkey` | Steward Verified issuer Ed25519 public key — verify record signatures offline | V3.9.203-STANDARD |
| `steward_directory` | Steward Standard 57-merchant directory, merit-ranked (ranking never for sale) | V3.9.203-STANDARD |
| `steward_spend_today` | This server's local spend meter (free, local) | base build |

## Superseded servers

This is the one canonical MCP server. The directories below are left in place
for history but are superseded — do not build on them:

| Directory | What it was | Why superseded |
|---|---|---|
| `ops/mcp/brianbooms-mcp/` (+ `-py`, `-github`, `-py-1.0.4-staged`, `-py-1.0.5-build` variants; npm `brianbooms-mcp` v1.0.7) | 5 read-only discovery tools | Ported here as `steward_catalog`, `steward_product`, `steward_purchase_instructions`, `steward_rewards`, `steward_payment_format` |
| `ops/x402/mcp-fee-oracle/` | 2 fee-oracle tools (`cheapest_route`, `route_fees`) | Ported here as `steward_cheapest_route`, `steward_route_fees` |
| `ops/mcp/synthetic-universe/` | Stage-only server; tools duplicate the paid set | Duplicates — the base tools here are the payment-capable versions |
| `ops/su-store/mcp/` | Frozen 3-product Stripe catalog + Stripe checkout/order tools | Catalog deduped by the live `steward_catalog`; Stripe checkout tools superseded by the x402 buy flow |

## Install

Requires Node 20+.

```bash
cd steward-mcp
npm install
npm run build
```

## Configure

```bash
cp .env.example .env
# edit .env:
```

| Variable | Required | Default | What it is |
|---|---|---|---|
| `STEWARD_PAYER_KEY` | **yes** | — | Your Base wallet private key (`0x...`). Funds the $0.01/call payments. |
| `STEWARD_MAX_SPEND_USDC` | no | `0.05` | Hard ceiling per single call. The server refuses to sign above this. |
| `STEWARD_MAX_SPEND_DAY_USDC` | no | `5.00` | Hard ceiling per rolling 24h. |
| `STEWARD_RAIL_URL` | no | `https://pay.brianbooms.com` | Rail base URL. |

**Your key never leaves your machine.** The server uses it only to sign a
per-call EIP-3009 authorization ($0.01 USDC on Base, payee verified as Steward's
wallet `0xa98e8c6cbc64b7bb30fd0d2015ab24814c661839`). It is never logged, stored,
or transmitted anywhere else. Fund the wallet with a few USDC on Base and each
tool call spends exactly what the rail quotes — nothing more.

## Add to Claude Code / Cursor / Windsurf

**Claude Code** (`~/.claude.json` or project `.mcp.json`):
```json
{
  "mcpServers": {
    "steward": {
      "command": "node",
      "args": ["/absolute/path/to/steward-mcp/dist/index.js"],
      "env": {
        "STEWARD_PAYER_KEY": "0x...",
        "STEWARD_MAX_SPEND_USDC": "0.05",
        "STEWARD_MAX_SPEND_DAY_USDC": "5.00"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`): same shape under `"mcpServers"`.

Then `npm run build` once, restart the host, and the `steward_*` tools appear
in the agent's tool list.

## Framework integrations

Steward works natively with every major agent framework via MCP. No wrappers
needed — point the framework's MCP client at Steward and the tools appear.

### LangChain

```python
from langchain_mcp_adapters import MultiServerMCPClient

client = MultiServerMCPClient({
    "steward": {
        "command": "npx",
        "args": ["@brianbooms/steward-mcp"],
        "env": {"STEWARD_PAYER_KEY": "0x..."},
        "transport": "stdio",
    }
})
tools = await client.get_tools()  # steward_* tools as LangChain StructuredTools
```

### LlamaIndex

```python
from llama_index.tools.mcp import BasicMCPClient, McpToolSpec

mcp_client = BasicMCPClient(
    command_or_url="npx",
    args=["@brianbooms/steward-mcp"],
    env={"STEWARD_PAYER_KEY": "0x..."},
)
tool_spec = McpToolSpec(client=mcp_client)
tools = tool_spec.to_tool_list()
```

### CrewAI

```python
from crewai_tools import MCPServerAdapter

with MCPServerAdapter(
    command="npx",
    args=["@brianbooms/steward-mcp"],
    env={"STEWARD_PAYER_KEY": "0x..."},
) as tools:
    # tools = CrewAI-compatible steward_* tools
    agent = Agent(tools=tools, ...)
```

### AutoGen / AG2

```python
from autogen_ext.tools.mcp import StdioServerParams, mcp_server_tools

server_params = StdioServerParams(
    command="npx",
    args=["@brianbooms/steward-mcp"],
    env={"STEWARD_PAYER_KEY": "0x..."},
)
tools = await mcp_server_tools(server_params)
```

### Vercel AI SDK

```typescript
import { createMCPClient } from "@ai-sdk/mcp";

const mcpClient = await createMCPClient({
  transport: {
    type: "stdio",
    command: "npx",
    args: ["@brianbooms/steward-mcp"],
    env: { STEWARD_PAYER_KEY: "0x..." },
  },
});

const tools = await mcpClient.tools();
// use with generateText({ model, tools, prompt })
```

## How payment works

1. Tool calls the rail endpoint with no payment.
2. Rail answers HTTP 402 with an x402 quote (price, payee, asset, timeout).
3. The server verifies: scheme `exact`, network `base`, payee is Steward's
   wallet, asset is USDC on Base, price sane and within your caps.
4. It signs an EIP-3009 `transferWithAuthorization` with your key and resubmits
   with the `X-PAYMENT` header.
5. Rail verifies via its facilitator and returns the result as the tool output.

Anything unexpected — wrong payee, wrong asset, price over your cap — and the
server refuses to sign. No silent spending, ever.

## Verify without paying

```bash
npx tsx test/quotes.test.ts   # probes all 24 tools' live quotes, signs nothing
npx tsx test/smoke.test.ts    # boots the MCP server, lists tools over stdio
```

## Trust

- Prices are quoted by the rail per call; the server never invents a price.
- Every settled call appears on `steward_receipts` — public, per wallet.
- The terms: https://brianbooms.com/fair-dealing/ (the Fair Dealing page controls).
- Machine-readable catalog: https://brianbooms.com/.well-known/purchase-catalog.json

## License

MIT — Synthetic Universe LLC.
