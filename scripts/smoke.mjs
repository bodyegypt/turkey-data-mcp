#!/usr/bin/env node
/**
 * Smoke test: spins up the built server over stdio via the official MCP client
 * and calls every tool against the LIVE turkpidya.com API.
 *
 * Usage: npm run build && npm run smoke
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

const client = new Client({ name: "smoke-test", version: "1.0.0" });
const transport = new StdioClientTransport({ command: "node", args: [serverPath] });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`Connected. Server exposes ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

const cases = [
  ["get_gold_prices", {}],
  ["get_gold_prices", { category: "coin" }],
  ["get_exchange_rates", {}],
  ["get_exchange_rates", { currency: "usd" }],
  ["get_fuel_prices", {}],
  ["get_fuel_prices", { city: "istanbul" }],
  ["list_prayer_cities", {}],
  ["get_prayer_times", { city: "istanbul" }],
  ["get_earthquakes", { min_magnitude: 2, limit: 3 }],
  ["get_latest_earthquake", {}],
  // Error-path checks (expected to return isError with a helpful message):
  ["get_exchange_rates", { currency: "XXX" }],
  ["get_prayer_times", { city: "paris" }],
];

let failures = 0;
for (const [name, args] of cases) {
  const label = `${name}(${JSON.stringify(args)})`;
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? "";
    const expectError = ["XXX", "paris"].includes(args.currency ?? args.city ?? "");
    if (expectError) {
      const ok = result.isError && text.length > 0;
      if (!ok) failures++;
      console.log(`${ok ? "PASS(err)" : "FAIL"} ${label}\n  -> ${text.slice(0, 220).replace(/\n/g, " ")}\n`);
    } else {
      const ok = !result.isError && text.length > 2;
      if (!ok) failures++;
      console.log(`${ok ? "PASS" : "FAIL"} ${label}\n  -> ${text.slice(0, 220).replace(/\n/g, " ")}...\n`);
    }
  } catch (err) {
    failures++;
    console.log(`FAIL ${label}: ${err.message}\n`);
  }
}

await client.close();
console.log(failures === 0 ? "ALL SMOKE TESTS PASSED" : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
