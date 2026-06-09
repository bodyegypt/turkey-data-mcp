# Publication status & remaining steps

What's done and what the owner needs to run. Everything below assumes you're in this repo's root directory.

## Status

| Channel | Status |
|---------|--------|
| GitHub repo (`bodyegypt/turkey-data-mcp`) | ✅ Published (public) — `gh` was already authenticated |
| npm (`turkey-data-mcp`) | ⏳ Prepared — npm login required (name verified available) |
| Official MCP registry (registry.modelcontextprotocol.io) | ⏳ Prepared — `server.json` ready; requires npm publish first + GitHub login via mcp-publisher |
| Smithery / other directories | 📝 Listing text below |

Until npm publish happens, anyone can already use the server straight from GitHub:

```bash
claude mcp add turkey-data -- npx -y github:bodyegypt/turkey-data-mcp
```

(`dist/` is committed, so no build step is needed.)

## 1. Publish to npm (2 minutes)

```bash
npm login        # opens browser; use the Pidya Group npm account (create one at npmjs.com if needed)
npm publish      # runs the build automatically via prepublishOnly
```

Verify: `npm view turkey-data-mcp` and `npx -y turkey-data-mcp` (should print the startup line to stderr).

> Note: `package.json` already contains `"mcpName": "io.github.bodyegypt/turkey-data-mcp"` — the official MCP registry uses this field to verify npm package ownership. Don't remove it.

## 2. Publish to the official MCP registry (3 minutes, after npm)

```bash
# Install the publisher CLI (pick one)
brew install mcp-publisher
# or: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m).tar.gz" | tar xz mcp-publisher

# Authenticate with the GitHub account that owns the repo (bodyegypt)
mcp-publisher login github

# Publish (server.json is already in the repo root and validates against the 2025-12-11 schema)
mcp-publisher publish
```

Verify: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=turkey-data"`

## 3. When releasing a new version

1. Bump `version` in **both** `package.json` and `server.json` (and `VERSION` in `src/index.ts`).
2. `npm run build && npm run smoke`
3. Commit + push, then `npm publish`, then `mcp-publisher publish`.

## 4. Smithery & other directories (optional, listing text ready)

Smithery (smithery.ai) indexes GitHub repos — claim the server at https://smithery.ai/new using the GitHub login. Suggested listing text:

> **Name:** Turkey Data
> **Description:** Live Turkey data for AI: gold & silver prices (5-min refresh), official TCMB lira exchange rates, EPDK fuel pump prices, Diyanet prayer times for 20 cities, and the Kandilli earthquake feed. Free public API by turkpidya.com — no API key needed.
> **Categories:** Finance, Data & APIs, Weather & Environment
> **Homepage:** https://turkpidya.com/developers

The same blurb works for mcp.so, PulseMCP, and Glama directory submissions (all accept a GitHub URL: https://github.com/bodyegypt/turkey-data-mcp).
