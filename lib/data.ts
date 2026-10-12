import type { Address } from "viem";
import { ENVIO_URL } from "./config";
import type { LeaderTrade, Trader, Vibe } from "./types";

/* ------------------------------------------------------------------ names & vibes */

const NAMES = ["Momo", "Pip", "Juno", "Bix", "Tofu", "Ziggy", "Nori", "Kiki", "Bao", "Lumi", "Rex", "Olli"];
const QUOTES: Record<Vibe, { quote: string; tagline: string }> = {
  playful: { quote: "Small bets, quick exits. One tiny trade at a time.", tagline: "A little wit. A lighter way through." },
  steady: { quote: "Slow and boring wins. I'd rather sleep well.", tagline: "Low leverage. Long patience." },
  sharp: { quote: "In, out, done. I don't marry my positions.", tagline: "Fast hands. Tight stops." },
  bold: { quote: "When I'm right, I'm loud about it.", tagline: "Big swings. Big feelings." },
};

function hash(s: string) {
  let h = 2166136261;
  for (const c of s.toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function vibeFor(avgLev: number, winRate: number): Vibe {
  if (avgLev <= 3) return "steady";
  if (avgLev >= 12) return "bold";
  if (winRate >= 0.6) return "sharp";
  return "playful";
}

export const nameFor = (address: string) => NAMES[hash(address) % NAMES.length];

/** Hash collisions can give two traders the same name; walk to the next unused one so the list reads cleanly. */
function uniqueNames<T extends { address: string; name: string }>(list: T[]): T[] {
  const used = new Set<string>();
  return list.map((t) => {
    let i = NAMES.indexOf(t.name);
    for (let n = 0; n < NAMES.length && used.has(NAMES[i]); n++) i = (i + 1) % NAMES.length;
    used.add(NAMES[i]);
    return { ...t, name: NAMES[i] };
  });
}

/* ------------------------------------------------------------------ demo data (always labeled) */

const demoRaw: Array<[string, number, Partial<Trader["stats"]>]> = [
  ["0x8a3f5c21b9d4e7a6f0c1b2d3e4f5a6b7c8d9e0f1", 41, { trades: 212, winRate: 0.64, profitFactor: 1.9, maxDrawdown: 0.08, pnl30d: 4820, avgLeverage: 4, favMarket: "ETH" }],
  ["0x2b7e9d1c4a6f8e0b3d5c7a9e1f3b5d7c9e1a3b5c", 17, { trades: 98, winRate: 0.71, profitFactor: 2.4, maxDrawdown: 0.05, pnl30d: 2190, avgLeverage: 2, favMarket: "BTC" }],
  ["0x5d1a8f3e6c9b2d4f7a0e3c6b9d2f5a8e1c4b7d0a", 63, { trades: 341, winRate: 0.58, profitFactor: 1.6, maxDrawdown: 0.14, pnl30d: 6110, avgLeverage: 9, favMarket: "BTC" }],
  ["0xc4e7a0d3f6b9c2e5a8d1f4b7e0c3a6d9f2b5e8c1", 88, { trades: 57, winRate: 0.49, profitFactor: 1.4, maxDrawdown: 0.27, pnl30d: 9340, avgLeverage: 15, favMarket: "MON" }],
];

export const DEMO_TRADERS: Trader[] = uniqueNames(
  demoRaw.map(([address, accountId, s]): Trader => {
    const stats = s as Trader["stats"];
    const vibe = vibeFor(stats.avgLeverage, stats.winRate);
    return { address: address as Address, accountId, name: nameFor(address), vibe, ...QUOTES[vibe], stats, source: "demo" };
  }),
);

const DEMO_MARKETS = [
  { symbol: "BTC", price: 97_250, perpId: 1 },
  { symbol: "ETH", price: 3_420, perpId: 2 },
  { symbol: "MON", price: 0.42, perpId: 3 },
];

/** A plausible next trade for a demo trader — open or close, in their favourite market. */
export function demoTradeFor(t: Trader, open: Map<string, LeaderTrade>): LeaderTrade {
  const existing = [...open.values()].find((x) => x.trader === t.address);
  const m = DEMO_MARKETS.find((x) => x.symbol === (existing?.market ?? t.stats.favMarket)) ?? DEMO_MARKETS[0];
  const jitter = 1 + (Math.random() - 0.5) * 0.01;
  const base: Omit<LeaderTrade, "action" | "side" | "id"> = {
    trader: t.address,
    perpId: m.perpId,
    market: m.symbol,
    price: +(m.price * jitter).toPrecision(6),
    size: +((800 + Math.random() * 2400) / m.price).toPrecision(4),
    leverage: Math.max(1, Math.round(t.stats.avgLeverage * (0.7 + Math.random() * 0.6))),
    at: Date.now(),
    source: "demo",
  };
  const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (existing) return { ...base, id, side: existing.side, action: "close", size: existing.size };
  return { ...base, id, side: Math.random() > 0.4 ? "long" : "short", action: "open" };
}

/* ------------------------------------------------------------------ Envio HyperIndex */

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "Envio query failed");
  return json.data as T;
}

interface EnvioTrader {
  id: string;
  accountId: string;
  trades: number;
  wins: number;
  losses: number;
  grossProfit: number;
  grossLoss: number;
  realizedPnl: number;
  maxDrawdown: number;
  sumLeverage: number;
  favMarket: string | null;
}

export async function fetchTraders(): Promise<{ traders: Trader[]; live: boolean }> {
  if (!ENVIO_URL) return { traders: DEMO_TRADERS, live: false };
  try {
    const data = await gql<{ Trader: EnvioTrader[] }>(`
      query Leaderboard {
        Trader(order_by: { realizedPnl: desc }, limit: 30, where: { trades: { _gte: 3 } }) {
          id accountId trades wins losses grossProfit grossLoss realizedPnl maxDrawdown sumLeverage favMarket
        }
      }`);
    const traders = uniqueNames(data.Trader.map((r): Trader => {
      const closed = r.wins + r.losses;
      const winRate = closed ? r.wins / closed : 0;
      const avgLeverage = r.trades ? r.sumLeverage / r.trades : 1;
      const vibe = vibeFor(avgLeverage, winRate);
      return {
        address: r.id as Address,
        accountId: Number(r.accountId),
        name: nameFor(r.id),
        vibe,
        ...QUOTES[vibe],
        source: "envio",
        stats: {
          trades: r.trades,
          winRate,
          profitFactor: r.grossLoss > 0 ? r.grossProfit / r.grossLoss : r.grossProfit > 0 ? 9.99 : 0,
          maxDrawdown: r.maxDrawdown,
          pnl30d: r.realizedPnl,
          avgLeverage: +avgLeverage.toFixed(1),
          favMarket: r.favMarket ?? "—",
        },
      };
    }));
    return traders.length ? { traders, live: true } : { traders: DEMO_TRADERS, live: false };
  } catch {
    return { traders: DEMO_TRADERS, live: false };
  }
}

interface EnvioTrade {
  id: string;
  trader: string;
  perpId: number;
  market: string;
  side: string;
  action: string;
  price: number;
  size: number;
  leverage: number;
  timestamp: number;
  txHash: string;
}

/** New trades by `trader` since `sinceSec` — the copy engine's input stream. */
export async function fetchTradesSince(trader: Address, sinceSec: number): Promise<LeaderTrade[]> {
  const data = await gql<{ Trade: EnvioTrade[] }>(
    `query Since($t: String!, $s: Int!) {
      Trade(where: { trader: { _eq: $t }, timestamp: { _gt: $s } }, order_by: { timestamp: asc }, limit: 50) {
        id trader perpId market side action price size leverage timestamp txHash
      }
    }`,
    { t: trader.toLowerCase(), s: sinceSec },
  );
  return data.Trade.map((r) => ({
    id: r.id,
    trader: r.trader as Address,
    perpId: r.perpId,
    market: r.market,
    side: r.side === "short" ? "short" : "long",
    action: r.action === "close" ? "close" : "open",
    price: r.price,
    size: r.size,
    leverage: r.leverage,
    at: r.timestamp * 1000,
    txHash: r.txHash,
    source: "envio",
  }));
}

export async function fetchRecentTrades(trader: Address, limit = 12): Promise<LeaderTrade[]> {
  if (!ENVIO_URL) return [];
  const data = await gql<{ Trade: EnvioTrade[] }>(
    `query Recent($t: String!, $n: Int!) {
      Trade(where: { trader: { _eq: $t } }, order_by: { timestamp: desc }, limit: $n) {
        id trader perpId market side action price size leverage timestamp txHash
      }
    }`,
    { t: trader.toLowerCase(), n: limit },
  ).catch(() => ({ Trade: [] as EnvioTrade[] }));
  return data.Trade.map((r) => ({
    id: r.id,
    trader: r.trader as Address,
    perpId: r.perpId,
    market: r.market,
    side: r.side === "short" ? "short" : "long",
    action: r.action === "close" ? "close" : "open",
    price: r.price,
    size: r.size,
    leverage: r.leverage,
    at: r.timestamp * 1000,
    txHash: r.txHash,
    source: "envio",
  }));
}
