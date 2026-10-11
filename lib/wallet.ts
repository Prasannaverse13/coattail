"use client";

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { createWalletClient, http, type Address, type WalletClient } from "viem";
import { CHAIN, RPC_URL } from "./config";

/**
 * Mera is the whole account layer: one passkey → PRF output → BIP-39/32 → EVM key.
 * Nothing secret is ever stored. localStorage only keeps the credential id (a public hint
 * so iOS jumps straight to Face ID) and the address (so the UI can paint before unlock).
 */
const CRED_KEY = "coattail.credential";
const ADDR_KEY = "coattail.address";
const PATH = "m/44'/60'/0'/0/0";

const rpId = () => location.hostname;

export interface Connected {
  address: Address;
  credential: PasskeyCredentialMetadata;
}

let live: { session: Secp256k1SigningSession; wallet: WalletClient; expiresAt: number; timer?: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const onSessionChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function deriveSession(prfOutput: Uint8Array) {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(PATH);
  if (!node.privateKey) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  // The session owns its own copy; wipe everything we touched.
  node.privateKey.fill(0);
  seed.fill(0);
  prfOutput.fill(0);
  return session;
}

function hold(session: Secp256k1SigningSession, minutes: number) {
  endSession();
  const wallet = createWalletClient({ account: toViemAccount(session), chain: CHAIN, transport: http(RPC_URL) });
  const expiresAt = Date.now() + minutes * 60_000;
  const timer = window.setTimeout(endSession, minutes * 60_000);
  live = { session, wallet, expiresAt, timer };
  emit();
}

/** First visit: one passkey ceremony creates the wallet. */
export async function createWallet(minutes = 15): Promise<Connected> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Coattail" },
    user: { name: `Coattail · ${new Date().toLocaleDateString()}`, displayName: "Coattail wallet" },
  });
  const credential: PasskeyCredentialMetadata = { credentialId: created.credentialId, transports: created.transports };
  const session = deriveSession(created.prfOutput);
  const address = getEvmAddress(session.publicKey) as Address;
  remember(credential, address);
  hold(session, minutes);
  return { address, credential };
}

/**
 * Returning visit — also the "stateless test": with empty storage we let iOS offer any synced
 * Coattail passkey, and the same address falls out of the PRF.
 */
export async function signIn(minutes = 15): Promise<Connected> {
  const known = storedCredential();
  const res = await getPasskeyPrfOutput({ rpId: rpId(), credential: known ?? undefined });
  const credential: PasskeyCredentialMetadata =
    known?.credentialId === res.credentialId ? known : { credentialId: res.credentialId };
  const session = deriveSession(res.prfOutput);
  const address = getEvmAddress(session.publicKey) as Address;
  remember(credential, address);
  hold(session, minutes);
  return { address, credential };
}

function remember(credential: PasskeyCredentialMetadata, address: Address) {
  try {
    localStorage.setItem(CRED_KEY, JSON.stringify(credential));
    localStorage.setItem(ADDR_KEY, address);
  } catch {}
}

export function storedCredential(): PasskeyCredentialMetadata | null {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : null;
  } catch {
    return null;
  }
}
export function storedAddress(): Address | null {
  try {
    return (localStorage.getItem(ADDR_KEY) as Address) || null;
  } catch {
    return null;
  }
}

/** Live signer, or null when the session window has closed (next action re-prompts Face ID). */
export function activeWallet(): WalletClient | null {
  if (!live) return null;
  if (Date.now() > live.expiresAt) {
    endSession();
    return null;
  }
  return live.wallet;
}
export const sessionExpiresAt = () => live?.expiresAt ?? 0;

/** Extend or re-open the signing window. Re-prompts only if the key is gone. */
export async function ensureSession(minutes = 15): Promise<WalletClient> {
  const w = activeWallet();
  if (w) return w;
  await signIn(minutes);
  return live!.wallet;
}

export function endSession() {
  if (live) {
    window.clearTimeout(live.timer);
    try {
      live.session.end();
    } catch {}
    live = null;
    emit();
  }
}

/** "Disconnect wallet": end the session and forget this device. The passkey itself stays in iCloud. */
export function disconnect() {
  endSession();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("coattail."))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}

export function friendlyError(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PRF_UNAVAILABLE":
        return "This device's passkey manager can't create a wallet yet. Use iCloud Keychain on iOS 18+ or 1Password.";
      case "PASSKEY_OPERATION_FAILED":
        return "Face ID was cancelled. Tap again when you're ready.";
      default:
        return e.message;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient funds|gas required exceeds/i.test(msg)) return "You need a little testnet MON for gas.";
  if (/User rejected|NotAllowedError/i.test(msg)) return "Face ID was cancelled.";
  return msg.split("\n")[0].slice(0, 160);
}
