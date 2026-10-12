import { NextResponse } from "next/server";

/**
 * Kimi writes the one-line "why" behind every copied (or skipped) trade, and a short
 * plain-English read on a trader. It receives only public trade facts — no keys, no balances.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.ai/v1";
const MODEL = process.env.MOONSHOT_MODEL ?? "kimi-k3";

const SYSTEM = `You are Coattail's trade narrator for people who are new to trading.
Write ONE plain-English sentence (max 24 words) explaining a copy-trading event.
No jargon without a short gloss, no hype, no financial advice, no emojis. Mention the risk limit when it mattered.`;

interface Body {
  kind: "trade" | "trader";
  trader?: { name: string; winRate: number; profitFactor: number; maxDrawdown: number; avgLeverage: number; favMarket: string; trades: number };
  trade?: { action: string; side: string; market: string; leverage: number };
  decision?: { kind: string; sizeUsd?: number; leverage?: number; reason?: string };
  policy?: { maxPerTradeUsd: number; maxLeverage: number; stopLossPct: number };
}

function fallback(b: Body): string {
  if (b.kind === "trader" && b.trader) {
    const t = b.trader;
    return `${t.name} wins ${(t.winRate * 100).toFixed(0)}% of closed trades, mostly ${t.favMarket} at about ${t.avgLeverage}x, with a worst dip of ${(t.maxDrawdown * 100).toFixed(0)}%.`;
  }
  const d = b.decision;
  const t = b.trade;
  if (!d || !t) return "Trade event recorded.";
  if (d.kind === "copy") return `Copied a ${t.side} on ${t.market} at ${d.leverage}x, capped at $${d.sizeUsd} by your limit.`;
  if (d.kind === "close") return `Your trader closed their ${t.market} position, so Coattail closed yours too.`;
  return `Skipped: ${d.reason ?? "outside your limits"}.`;
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || (b.kind !== "trade" && b.kind !== "trader")) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const key = process.env.MOONSHOT_API_KEY;
  if (!key) return NextResponse.json({ text: fallback(b), source: "template" });

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // No temperature: several Kimi models pin it and reject overrides with a 400.
        max_tokens: 400, // headroom in case the model spends tokens reasoning before the one-line answer
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(b) },
        ],
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      // Public error text from Kimi only (never the key); lets a bad model name or param show up in the response.
      const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 240);
      return NextResponse.json({ text: fallback(b), source: "template", note: `kimi ${res.status} ${detail}`.trim() });
    }
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    return NextResponse.json({ text: text || fallback(b), source: text ? "kimi" : "template" });
  } catch {
    return NextResponse.json({ text: fallback(b), source: "template" });
  }
}
