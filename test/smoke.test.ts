/** Smoke test: MCP server starts, lists 25 tools, spend_today works. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "src/index.ts"],
  env: {
    ...process.env,
    STEWARD_PAYER_KEY:
      "0x0000000000000000000000000000000000000000000000000000000000000001",
  },
});
const client = new Client({ name: "smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("tool count:", tools.length);
for (const t of tools) console.log(" -", t.name);
const r = await client.callTool({ name: "steward_spend_today", arguments: {} });
const text = (r.content as Array<{ text: string }>)[0].text;
console.log("spend_today_usdc:", JSON.parse(text).spent_today_usdc);
await client.close();
if (tools.length !== 25) {
  console.error("FAIL: expected 25 tools");
  process.exit(1);
}
console.log("SMOKE PASS");
