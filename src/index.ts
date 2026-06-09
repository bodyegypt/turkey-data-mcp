#!/usr/bin/env node
/**
 * turkey-data-mcp — MCP server for live Turkey data.
 *
 * Wraps the free public REST API at https://turkpidya.com/wp-json/turkpidya-data/v1/
 * (gold & silver prices, TCMB exchange rates, EPDK fuel prices, Diyanet prayer
 * times, Kandilli earthquake feed).
 *
 * (c) Pidya Group — https://turkpidya.com/developers — MIT license.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "1.0.0";
const API_BASE = "https://turkpidya.com/wp-json/turkpidya-data/v1";
const USER_AGENT = `turkey-data-mcp/${VERSION} (+https://turkpidya.com/developers)`;

/* ------------------------------------------------------------------ *
 * Client-side rate limiting.
 * The upstream API allows 60 requests/min per IP (HTTP 429 beyond that).
 * We keep a sliding 60-second window and stop at 50 to leave headroom
 * for other clients on the same IP.
 * ------------------------------------------------------------------ */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 50;
const requestTimestamps: number[] = [];

function checkRateLimit(): void {
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const retryInSec = Math.ceil((WINDOW_MS - (now - requestTimestamps[0])) / 1000);
    throw new Error(
      `Client-side rate limit reached (${MAX_REQUESTS_PER_WINDOW} requests/min to turkpidya.com). ` +
        `Wait about ${retryInSec}s and retry. Tip: most data refreshes every 5 minutes ` +
        `or slower, so re-requesting the same data sooner returns identical results.`
    );
  }
  requestTimestamps.push(now);
}

/* ------------------------------------------------------------------ *
 * HTTP helper with friendly error mapping.
 * API errors look like: { code, message, data: { status, cities? } }
 * ------------------------------------------------------------------ */
interface ApiErrorBody {
  code?: string;
  message?: string;
  data?: { status?: number; cities?: string[] };
}

async function apiGet(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<unknown> {
  checkRateLimit();

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach the turkpidya.com data API (${reason}). ` +
        `Check network connectivity and retry; the API itself is normally up 24/7.`
    );
  }

  if (response.status === 429) {
    throw new Error(
      "The turkpidya.com API returned HTTP 429 (rate limited: 60 requests/min per IP). " +
        "Wait about a minute before retrying."
    );
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `The API returned a non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`
    );
  }

  if (!response.ok) {
    const apiError = body as ApiErrorBody;
    let message = apiError.message ?? `API error (HTTP ${response.status})`;
    if (apiError.data?.cities?.length) {
      message += ` Valid cities: ${apiError.data.cities.join(", ")}.`;
    }
    throw new Error(message);
  }

  return body;
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/* ------------------------------------------------------------------ *
 * Server + tools
 * ------------------------------------------------------------------ */
const server = new McpServer({
  name: "turkey-data",
  version: VERSION,
});

server.registerTool(
  "get_gold_prices",
  {
    title: "Turkey Gold & Silver Prices",
    description:
      "Get current gold and silver prices in Turkey, quoted in Turkish lira (TRY). " +
      "Source: Harem Altın, cross-checked with TCMB; refreshed every 5 minutes. " +
      "Returns buy/sell prices, daily change (% and amount), weight and purity for: " +
      "gram gold (14k/18k/22k/24k), Turkish gold coins (çeyrek/quarter, yarım/half, tam/full, " +
      "cumhuriyet/republic, ata) and silver per gram. " +
      "Use the optional 'category' filter to narrow results; omit it for everything. " +
      "Use this for questions like 'gram altın ne kadar?', 'quarter gold coin price in Turkey', " +
      "or 'how much is 24k gold in Istanbul today?'.",
    inputSchema: {
      category: z
        .enum(["all", "gram", "coin", "silver"])
        .optional()
        .describe(
          "Filter by category: 'gram' = gold per gram (14k–24k), 'coin' = Turkish gold coins " +
            "(çeyrek, yarım, tam, cumhuriyet, ata), 'silver' = silver per gram, " +
            "'all' (default) = everything."
        ),
    },
  },
  async ({ category }) => {
    try {
      return jsonResult(await apiGet("/gold", { category }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_exchange_rates",
  {
    title: "Turkish Lira Exchange Rates (TCMB)",
    description:
      "Get official Turkish lira (TRY) exchange rates from TCMB, the Central Bank of the " +
      "Republic of Türkiye. Returns forex and banknote buy/sell rates for ~22 currencies " +
      "(USD, EUR, GBP, JPY, SAR, AED, RUB, etc.). Rates are the official daily fixing " +
      "published ~15:31 Istanbul time on trading days; weekends/holidays return the last " +
      "trading day. Pass 'currency' (ISO 4217 code) for a single currency, or omit it for " +
      "the full table. Note: JPY is quoted per 100 units (check the 'unit' field). " +
      "Use this for 'dollar to lira rate', 'EUR/TRY today', or converting amounts to/from TRY.",
    inputSchema: {
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/, "Must be a 3-letter ISO 4217 code, e.g. USD")
        .optional()
        .describe(
          "Optional 3-letter ISO 4217 currency code (e.g. 'USD', 'EUR', 'SAR'). " +
            "Case-insensitive. Omit to get all ~22 currencies TCMB publishes."
        ),
    },
  },
  async ({ currency }) => {
    try {
      const path = currency ? `/fx/${currency.toUpperCase()}` : "/fx";
      return jsonResult(await apiGet(path));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_fuel_prices",
  {
    title: "Turkey Fuel Pump Prices",
    description:
      "Get current pump fuel prices in Turkey in TRY per litre, aggregated from official EPDK " +
      "(Energy Market Regulatory Authority) per-brand reports. Covers gasoline 95 octane " +
      "('benzin95') and diesel ('motorin') with city averages plus min/max across brands. " +
      "Available cities: istanbul, ankara, izmir, antalya. Pass 'city' to get one city, " +
      "or omit it to compare all four. Refreshed every 6 hours. " +
      "Use this for 'petrol price in Istanbul', 'diesel cost Turkey', 'benzin fiyatı'.",
    inputSchema: {
      city: z
        .enum(["istanbul", "ankara", "izmir", "antalya"])
        .optional()
        .describe(
          "Optional city filter. One of: istanbul, ankara, izmir, antalya. " +
            "Omit to get all four cities for comparison."
        ),
    },
  },
  async ({ city }) => {
    try {
      return jsonResult(await apiGet("/fuel", { city }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_prayer_times",
  {
    title: "Prayer Times for Turkish Cities",
    description:
      "Get Islamic prayer times (namaz vakitleri) for a Turkish city using the official " +
      "Diyanet İşleri calculation method. Returns fajr, sunrise, dhuhr, asr, maghrib and isha " +
      "in 24-hour local Istanbul time, plus the Hijri date. " +
      "The 'city' parameter is REQUIRED — call list_prayer_cities first if unsure which " +
      "cities are available (20 major Turkish cities, lowercase ASCII slugs like 'istanbul', " +
      "'ankara', 'sanliurfa'). Optional 'date' (YYYY-MM-DD) defaults to today; only a few " +
      "days around today are cached — far-future or past dates return an error. " +
      "Use this for 'iftar time in Istanbul', 'when is maghrib in Ankara', 'namaz vakitleri'.",
    inputSchema: {
      city: z
        .string()
        .min(2)
        .describe(
          "City slug, lowercase ASCII, e.g. 'istanbul', 'izmir', 'diyarbakir', 'sanliurfa'. " +
            "Turkish characters are transliterated (ş→s, ı→i, ü→u...). " +
            "Call list_prayer_cities for the full list of 20 supported cities."
        ),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
        .optional()
        .describe(
          "Optional date in YYYY-MM-DD format. Defaults to today (Europe/Istanbul). " +
            "Only dates near today are available."
        ),
    },
  },
  async ({ city, date }) => {
    try {
      return jsonResult(
        await apiGet("/prayer-times", { city: city.toLowerCase().trim(), date })
      );
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_prayer_cities",
  {
    title: "List Supported Prayer-Time Cities",
    description:
      "List the Turkish city slugs supported by get_prayer_times (20 major cities, e.g. " +
      "istanbul, ankara, izmir, bursa, antalya, konya...). Call this before get_prayer_times " +
      "when you are not sure a city is supported or how its slug is spelled. Takes no parameters.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/prayer-times/cities"));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_earthquakes",
  {
    title: "Recent Earthquakes in Turkey",
    description:
      "Get recent earthquakes in and around Turkey from the Kandilli Observatory (KOERI) " +
      "official feed, refreshed every 5 minutes. Returns magnitude, depth (km), coordinates, " +
      "location name and timestamp (Istanbul time) for each event, newest first. " +
      "Filters: 'hours' = lookback window (default 24, max 168 = 7 days), " +
      "'min_magnitude' = minimum magnitude (e.g. 3 to skip micro-quakes), " +
      "'city' = substring match on the location name (e.g. 'izmir', 'balikesir'), " +
      "'limit' = max results (default 20, max 100). " +
      "Use this for 'was there an earthquake in Turkey today?', 'deprem son dakika', " +
      "'earthquakes near Izmir this week'. For just the single most recent event, " +
      "use get_latest_earthquake instead.",
    inputSchema: {
      hours: z
        .number()
        .int()
        .min(1)
        .max(168)
        .optional()
        .describe("Lookback window in hours. Default 24, max 168 (7 days)."),
      min_magnitude: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Only return quakes at or above this magnitude. Default 0 (all)."),
      city: z
        .string()
        .optional()
        .describe(
          "Case-insensitive substring filter on the location name, e.g. 'izmir', " +
            "'balikesir', 'mugla'. Use ASCII (no Turkish characters)."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of earthquakes to return. Default 20, max 100."),
    },
  },
  async ({ hours, min_magnitude, city, limit }) => {
    try {
      return jsonResult(
        await apiGet("/earthquakes", { hours, min_magnitude, city, limit })
      );
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_latest_earthquake",
  {
    title: "Latest Earthquake in Turkey",
    description:
      "Get the single most recent earthquake recorded in or around Turkey by the Kandilli " +
      "Observatory (KOERI). Returns magnitude, depth, coordinates, location and time " +
      "(Istanbul timezone). Feed refreshes every 5 minutes. Takes no parameters. " +
      "Use this for 'what was the last earthquake in Turkey?' — for lists, filtering or a " +
      "longer time window, use get_earthquakes instead.",
    inputSchema: {},
  },
  async () => {
    try {
      return jsonResult(await apiGet("/earthquakes/latest"));
    } catch (err) {
      return errorResult(err);
    }
  }
);

/* ------------------------------------------------------------------ */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for MCP protocol traffic — log to stderr only.
  console.error(`turkey-data-mcp v${VERSION} running on stdio (API: ${API_BASE})`);
}

main().catch((err) => {
  console.error("Fatal error starting turkey-data-mcp:", err);
  process.exit(1);
});
