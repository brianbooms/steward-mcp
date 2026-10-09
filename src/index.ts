/**
 * Steward MCP Server — entry point (stdio transport).
 *
 * Exposes Steward's x402 rail as MCP tools. Each tool call settles $0.01 USDC
 * on Base, signed by the user's own payer key (STEWARD_PAYER_KEY). Steward —
 * the machine Brian Booms named — quotes fair prices, verifies payment
 * cryptographically, delivers goods, and accounts for every cent.
 *
 * Public identity: Brian Booms is an AI-assisted artist/content creator.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, spentTodayUsdc } from "./config.js";
import { TOOLS, runTool } from "./tools.js";

const server = new McpServer({
  name: "steward",
  version: "0.3.0",
  description:
    "Steward — Brian Booms' x402 pay-per-call rail. 25 tools: 14 paid calls " +
    "(eleven $0.01 data/audio calls, trust verify-status $0.01, trust " +
    "agent-attestation and screen $0.02 each — all USDC on Base, quoted per " +
    "call by the rail and settled from your own wallet after quote " +
    "verification) plus 11 free read-only tools: store discovery (catalog, " +
    "product, purchase instructions, rewards, payment guide), fee oracle " +
    "(cheapest route, fee table), receipts, local spend meter, verifier " +
    "pubkey, and the 57-merchant Steward directory.",
});

for (const tool of TOOLS) {
  server.tool(tool.name, tool.description, tool.schema, async (args) => {
    const cfg = loadConfig(); // re-read env per call; fails fast if key missing
    return runTool(cfg, tool.name, args as Record<string, unknown>);
  });
}

// Read-only status tool (free, local): today's metered spend through this server.
server.tool(
  "steward_spend_today",
  "This server's local spend meter: USDC spent through this process today. " +
    "In-memory and per-process (resets on restart) — a safety rail, not " +
    "accounting; the rail's receipts (steward_receipts) are the source of " +
    "truth for settled spend. Free, no rail call.",
  {},
  async () => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { spent_today_usdc: spentTodayUsdc(), note: "Local meter only. Rail receipts: steward_receipts." },
          null,
          2
        ),
      },
    ],
  })
);

async function main() {
  // Fail fast on missing key so misconfiguration surfaces at startup, not mid-call.
  try {
    loadConfig();
  } catch (e) {
    console.error(`[steward] ${(e as Error).message}`);
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[steward] MCP server up — ${TOOLS.length} tools + steward_spend_today. Rail: https://pay.brianbooms.com`);
}

main().catch((e) => {
  console.error("[steward] fatal:", e);
  process.exit(1);
});
