import { NextResponse } from "next/server";

/**
 * Nansen enrichment, server-side so the key never reaches the browser.
 * Calls POST /api/v1/profiler/address/labels (100 credits when non-empty, 0 when empty) and
 * caches per address for 6h so a leaderboard refresh can't burn the balance.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = (globalThis as unknown as { __nansen?: Map<string, { at: number; v: unknown }> }).__nansen ?? new Map();
(globalThis as unknown as { __nansen?: typeof cache }).__nansen = cache;
const TTL = 6 * 3600_000;

interface Label {
  label: string;
  category?: string;
  kind?: string;
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "bad address" }, { status: 400 });

  const key = process.env.NANSEN_API_KEY;
  if (!key) return NextResponse.json({ configured: false, labels: [], smartMoney: false });

  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.v);

  try {
    const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/labels", {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      // chain "all": a Monad-only query is often empty for new wallets, and empty calls are free
      body: JSON.stringify({ address, chain: "all", pagination: { page: 1, per_page: 25 } }),
    });
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({ configured: true, error: body?.code ?? "forbidden", labels: [], smartMoney: false });
    }
    if (!res.ok) return NextResponse.json({ configured: true, error: `nansen ${res.status}`, labels: [], smartMoney: false });
    const json = (await res.json()) as { data?: Label[] };
    const labels = (json.data ?? []).map((l) => ({ label: l.label, category: l.category ?? "", kind: l.kind ?? "" }));
    const smartMoney = labels.some((l) => /smart/i.test(l.label) || /smart/i.test(l.category));
    const out = { configured: true, labels, smartMoney };
    cache.set(address, { at: Date.now(), v: out });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : "fetch failed", labels: [], smartMoney: false });
  }
}
