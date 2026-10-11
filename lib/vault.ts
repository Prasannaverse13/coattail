"use client";

import { getPasskeyPrfOutput, type PasskeyCredentialMetadata } from "@category-labs/mera";

/**
 * Mera "one passkey, many keys": the wallet uses Mera's default PRF salt; the vault uses its own
 * salt (sha256("coattail.vault.v1")), so the two key spaces are cryptographically unrelated.
 * From the vault PRF output we HKDF two values:
 *   - an AES-GCM key (non-extractable) that encrypts notes + profile
 *   - a storage id, so only the passkey holder can even locate their ciphertext
 * The server only ever sees { id, iv, ct }. Same passkey on a new device → same key → same data.
 */
const te = new TextEncoder();
const td = new TextDecoder();

let cached: { key: CryptoKey; id: string } | null = null;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function vaultSalt() {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode("coattail.vault.v1")));
}

export const vaultUnlocked = () => cached !== null;
export const lockVault = () => {
  cached = null;
};

export async function unlockVault(credential?: PasskeyCredentialMetadata | null) {
  if (cached) return cached;
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: location.hostname,
    credential: credential ?? undefined,
    prfSalt: await vaultSalt(),
  });
  const ikm = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey", "deriveBits"]);
  prfOutput.fill(0);
  const salt = te.encode("coattail");
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: te.encode("vault/aes-gcm") },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const idBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: te.encode("vault/storage-id") }, ikm, 256);
  cached = { key, id: hex(idBits) };
  return cached;
}

export interface Sealed {
  v: 1;
  iv: string;
  ct: string;
  at: number;
}

export async function seal(data: unknown): Promise<Sealed> {
  if (!cached) throw new Error("vault locked");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cached.key, te.encode(JSON.stringify(data)));
  return { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ct)), at: Date.now() };
}

export async function open<T>(sealed: Sealed): Promise<T> {
  if (!cached) throw new Error("vault locked");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, cached.key, unb64(sealed.ct));
  return JSON.parse(td.decode(pt)) as T;
}

/** Untrusted storage: the server and localStorage both only hold ciphertext. */
export async function pushVault(data: unknown) {
  const sealed = await seal(data);
  try {
    localStorage.setItem("coattail.vault", JSON.stringify(sealed));
  } catch {}
  await fetch(`/api/vault?id=${cached!.id}`, { method: "PUT", body: JSON.stringify(sealed) }).catch(() => null);
  return sealed;
}

export async function pullVault<T>(): Promise<T | null> {
  if (!cached) throw new Error("vault locked");
  let sealed: Sealed | null = null;
  const remote = await fetch(`/api/vault?id=${cached.id}`).catch(() => null);
  if (remote?.ok) sealed = (await remote.json()) as Sealed;
  if (!sealed) {
    try {
      const raw = localStorage.getItem("coattail.vault");
      if (raw) sealed = JSON.parse(raw) as Sealed;
    } catch {}
  }
  return sealed ? open<T>(sealed) : null;
}
