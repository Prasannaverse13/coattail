import type { LeaderTrade, Policy } from "./types";

export type Decision =
  | { kind: "copy"; sizeUsd: number; leverage: number }
  | { kind: "close" }
  | { kind: "skip"; reason: string };

export interface EngineState {
  sessionOpen: boolean;
  equityStart: number;
  equityNow: number;
  /** markets where we hold a mirrored position, keyed by symbol */
  mirrored: Set<string>;
  freeCollateral: number;
}

/**
 * The risk engine. Pure and synchronous so it is trivially testable and easy to explain in the
 * demo: every leader trade goes through the same five checks, in order.
 */
export function decide(t: LeaderTrade, p: Policy, s: EngineState): Decision {
  if (t.trader.toLowerCase() !== p.traderAddress.toLowerCase()) return { kind: "skip", reason: "Not your trader" };

  if (t.action === "close") {
    return s.mirrored.has(t.market) ? { kind: "close" } : { kind: "skip", reason: "You had no copy open here" };
  }

  if (!s.sessionOpen) return { kind: "skip", reason: "Autopilot window ended — tap to resume" };

  if (p.markets.length && !p.markets.includes(t.market)) return { kind: "skip", reason: `${t.market} isn't on your list` };

  const drawdown = s.equityStart > 0 ? (s.equityStart - s.equityNow) / s.equityStart : 0;
  if (drawdown * 100 >= p.stopLossPct) return { kind: "skip", reason: `Paused: down ${(drawdown * 100).toFixed(1)}% (limit ${p.stopLossPct}%)` };

  if (s.mirrored.has(t.market)) return { kind: "skip", reason: `Already copying a ${t.market} position` };

  const leverage = Math.min(t.leverage, p.maxLeverage);
  // margin needed = notional / leverage; never use more than the free collateral
  const affordable = s.freeCollateral * leverage * 0.95;
  const sizeUsd = Math.min(p.maxPerTradeUsd, affordable);
  if (sizeUsd < 1) return { kind: "skip", reason: "Not enough free balance" };

  return { kind: "copy", sizeUsd: +sizeUsd.toFixed(2), leverage };
}

export const defaultPolicy = (traderAddress: `0x${string}`): Policy => ({
  traderAddress,
  maxPerTradeUsd: 25,
  maxLeverage: 3,
  markets: [],
  stopLossPct: 10,
  sessionMinutes: 30,
});
