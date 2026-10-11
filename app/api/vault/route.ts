import { del, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

/**
 * Untrusted ciphertext store. The id is derived from the user's passkey PRF (HKDF), so only the
 * passkey holder can compute it, and the body is AES-GCM ciphertext — the server learns nothing.
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise a best-effort in-memory map
 * (fine for a single demo session, lost on cold start — the client keeps a local copy too).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mem = (globalThis as unknown as { __vault?: Map<string, string> }).__vault ?? new Map<string, string>();
(globalThis as unknown as { __vault?: Map<string, string> }).__vault = mem;

const okId = (id: string | null): id is string => !!id && /^[0-9a-f]{64}$/.test(id);
const blobPath = (id: string) => `vault/${id}.json`;
const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!okId(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  if (hasBlob()) {
    const { blobs } = await list({ prefix: blobPath(id), limit: 1 });
    if (!blobs[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    return new NextResponse(await res.text(), { headers: { "content-type": "application/json" } });
  }
  const v = mem.get(id);
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(v, { headers: { "content-type": "application/json" } });
}

export async function PUT(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!okId(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.text();
  if (body.length > 64_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const parsed = JSON.parse(body);
    if (parsed?.v !== 1 || typeof parsed.iv !== "string" || typeof parsed.ct !== "string") throw new Error("shape");
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (hasBlob()) {
    await put(blobPath(id), body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
  } else {
    mem.set(id, body);
  }
  return NextResponse.json({ ok: true, store: hasBlob() ? "blob" : "memory" });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!okId(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  if (hasBlob()) {
    const { blobs } = await list({ prefix: blobPath(id), limit: 1 });
    if (blobs[0]) await del(blobs[0].url);
  } else mem.delete(id);
  return NextResponse.json({ ok: true });
}
