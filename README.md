# turkey-data-mcp

**MCP server for live Turkey data** — gold & silver prices, official TCMB exchange rates, fuel pump prices, prayer times and the Kandilli earthquake feed. Give Claude (or any MCP-compatible AI) real-time answers about Turkey.

Powered by the free public API at [turkpidya.com](https://turkpidya.com/developers). No API key required.

## Tools

| Tool | What it returns | Refresh |
|------|-----------------|---------|
| `get_gold_prices` | Gold (gram 14k–24k, Turkish coins) & silver prices in TRY, buy/sell + daily change | 5 min |
| `get_exchange_rates` | Official TCMB rates for ~22 currencies vs Turkish lira (forex & banknote) | daily |
| `get_fuel_prices` | EPDK pump prices (gasoline 95, diesel) for Istanbul, Ankara, Izmir, Antalya | 6 h |
| `get_prayer_times` | Diyanet-method prayer times for 20 Turkish cities, with Hijri date | daily |
| `list_prayer_cities` | The 20 supported city slugs | daily |
| `get_earthquakes` | Recent quakes from Kandilli Observatory, filterable by window/magnitude/location | 5 min |
| `get_latest_earthquake` | The single most recent quake | 5 min |

Example prompts once installed:

> "What's the dollar–lira rate today?" · "Gram altın ne kadar?" · "Was there an earthquake near Izmir this week?" · "When is maghrib in Istanbul?" · "Compare diesel prices between Ankara and Antalya."

## Install

Requires Node.js ≥ 18.

> **Note:** until the npm package goes live you can install straight from GitHub — replace `turkey-data-mcp` with `github:bodyegypt/turkey-data-mcp` in any snippet below (no build step needed, `dist/` is committed).

### Claude Code (CLI)

```bash
claude mcp add turkey-data -- npx -y turkey-data-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "turkey-data": {
      "command": "npx",
      "args": ["-y", "turkey-data-mcp"]
    }
  }
}
```

### Any other MCP client (stdio)

```bash
npx -y turkey-data-mcp
```

### From source

```bash
git clone https://github.com/bodyegypt/turkey-data-mcp.git
cd turkey-data-mcp && npm install && npm run build
node dist/index.js
```

## Data sources & limits

- **Gold/silver:** Harem Altın, cross-checked with TCMB · **FX:** TCMB official daily fixing · **Fuel:** EPDK per-brand reports, city averages · **Prayer times:** Diyanet İşleri calculation method · **Earthquakes:** Kandilli Observatory (KOERI).
- All timestamps are Europe/Istanbul. All prices in TRY.
- The upstream API allows **60 requests/min per IP**; this server throttles itself client-side and returns a clear retry message if exceeded.
- Raw REST API (no MCP needed): `https://turkpidya.com/wp-json/turkpidya-data/v1/` — see [turkpidya.com/developers](https://turkpidya.com/developers).

## Development

```bash
npm install
npm run build   # compile TypeScript to dist/
npm run smoke   # run all tools against the live API via a real MCP stdio client
```

## License & attribution

MIT © [Pidya Group](https://turkpidya.com). Data served by [turkpidya.com](https://turkpidya.com) — attribution appreciated when republishing data. Contact: info@pidyagroup.com
