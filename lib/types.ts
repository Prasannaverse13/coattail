import type { Address } from "viem";

export type Goal = "steady" | "bigmoves" | "learn" | "small";

export type Vibe = "playful" | "steady" | "sharp" | "bold";

/** A Perpl trader we can follow. `account` is the on-chain Perpl account id. */
export interface Trader {
  address: Address;
  accountId: number;
  name: string;
  vibe: Vibe;
  quote: string;
  tagline: string;
  stats: TraderStats;
  /** where this row came from — never present demo rows as real */
  source: "envio" | "demo";
}

export interface TraderStats {
  trades: number;
  winRate: number; // 0..1
  profitFactor: number;
  maxDrawdown: number; // 0..1
  pnl30d: number; // USD
  avgLeverage: number;
  favMarket: string;
  smartMoney?: boolean; // Nansen label
}

/** A leader trade event: someone opened/closed a position on Perpl. */
export interface LeaderTrade {
  id: string;
  trader: Address;
  perpId: number;
  market: string;
  side: "long" | "short";
  action: "open" | "close";
  price: number;
  size: number; // base units
  leverage: number;
  at: number; // ms
  txHash?: string;
  source: "envio" | "demo";
}

export interface Policy {
  traderAddress: Address;
  maxPerTradeUsd: number;
  maxLeverage: number;
  markets: string[]; // allowed market symbols, empty = all
  stopLossPct: number; // pause copying if equity down this much since start
  sessionMinutes: number; // autopilot window
  startedAt?: number;
}

export interface CopyRecord {
  id: string;
  leaderTradeId: string;
  market: string;
  side: "long" | "short";
  action: "open" | "close";
  sizeUsd: number;
  leverage: number;
  status: "sent" | "confirmed" | "skipped" | "failed" | "simulated";
  reason?: string; // why skipped / failed
  explain?: string; // Kimi
  txHash?: string;
  at: number;
}

export interface Market {
  perpId: number;
  symbol: string;
  priceDecimals: number;
  lotDecimals: number;
  mark: number;
  maxLeverage: number;
}
