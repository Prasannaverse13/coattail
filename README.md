# Coattail

**Copy proven Perpl traders on Monad. Your Face ID is the wallet, and your limits are the risk engine.**

Coattail is a mobile web app (installable to the iPhone home screen) for people who want exposure to good traders without staring at charts:

1. **Connect with one passkey.** Mera derives an EVM wallet from your passkey's PRF output. No seed phrase, no extension, no custody backend.
2. **Pick a trader who matches your vibe.** The leaderboard is built from Perpl's on-chain events by an Envio HyperIndex indexer, enriched with Nansen labels, and summarised in plain English by Kimi.
3. **Set limits on a dial**: max $ per trade, max leverage, stop-loss and an autopilot window.
4. **Autopilot mirrors their trades on Perpl** (`execOrder` straight to the Exchange contract) inside your limits. Every copy *and every skip* shows up in your feed with a one-line reason.
5. **Private notes** are encrypted with a *second* key from the same passkey (separate PRF salt). Open Coattail on a new device and your notes come back.

> Built for Monad Blitz **Metropolis**: primary track **Onchain Finance & Trading**.

---

## Bounty map

| Bounty | What Coattail does | Where |
|---|---|---|
| **Agora: Mobile Trading App** | Mera passkey login, AUSD balance (Perpl collateral is aUSD), trades placed on Perpl | `lib/wallet.ts`, `lib/perpl.ts`, `components/Home.tsx` |
| **Perpl: Best use of API** | Copy-trading automation with risk caps: IOC orders with slippage bounds, per-trade cap, leverage cap, stop-loss, session window | `lib/engine.ts`, `lib/store.tsx` (autopilot loop), `lib/perpl.ts` |
| **Perpl: Analytics / Risk** | Trader leaderboard + wallet drill-down: win rate, profit factor, max drawdown, favourite market, recent trades | `indexer/`, `components/Home.tsx` (Traders, Activity) |
| **Mera: Best UX** | One-prompt onboarding, Mera is the only account layer, time-boxed signing session (autopilot window), **stateless test** passes (wipe storage → Sign in → same address) | `lib/wallet.ts` |
| **Mera: One Passkey, Many Keys** | A second PRF namespace (`sha256("coattail.vault.v1")`) → HKDF → AES-GCM key + storage id. Encrypts notes and profile; the server only stores ciphertext. Cross-device restore works. | `lib/vault.ts`, `app/api/vault/route.ts` |
| **Envio** | HyperIndex indexer on Perpl's Exchange: `AccountCreated`, `ContractAdded(V2)`, `PositionOpened/Increased/Closed/Decreased/Liquidated`, `CollateralDeposit` → `Trader`, `Trade`, `Market` entities. The app's leaderboard and copy stream read its GraphQL. | `indexer/` |
| **Nansen** | Server-side `POST /api/v1/profiler/address/labels` tags traders as Smart Money (cached 6h; empty responses are free) | `app/api/nansen/route.ts` |
| **Kimi** | Plain-English "why" for every copied/skipped trade and a one-line read on each trader | `app/api/explain/route.ts` |
| **Alchemy** | Monad testnet RPC when `NEXT_PUBLIC_ALCHEMY_KEY` is set | `lib/config.ts` |

## How the risk engine works

`lib/engine.ts` is a pure function. Every leader trade goes through the same checks, in order:

1. Is it the trader you follow?
2. Close → only if you hold a mirrored position in that market.
3. Is the autopilot window still open? (Mera sessions are in-memory keys. When the window ends the key is zeroed and the next action needs Face ID again.)
4. Is the market on your list?
5. Are you past your stop-loss?
6. Size = min(your per-trade cap, what your free collateral can margin at your max leverage). Leverage = min(theirs, your cap).

Orders are immediate-or-cancel at mark ± 1%, so a copy can never fill worse than that bound.

## Practice vs live

Until the indexer URL is configured **and** your wallet has an open Perpl account, Coattail runs in **practice mode**: demo traders and simulated fills, clearly labelled "Demo" / "Practice" everywhere. Nothing is presented as real that isn't.

---

## Run it

```bash
npm install
cp .env.example .env.local   # fill what you have, everything is optional
npm run dev
```

Passkeys need HTTPS (or `localhost`). PRF works with iCloud Keychain on iOS 18+/macOS 15+ and with 1Password.

**Note:** passkeys are bound to the domain. Pick your production domain before recording the demo, because a passkey made on a preview URL won't work on another domain.

### Environment

| Var | Needed for |
|---|---|
| `NEXT_PUBLIC_ENVIO_URL` | Live leaderboard + copy stream (Envio Cloud GraphQL URL) |
| `NEXT_PUBLIC_ALCHEMY_KEY` | Alchemy RPC (falls back to the public Monad RPC) |
| `NANSEN_API_KEY` | Smart-money labels |
| `MOONSHOT_API_KEY`, `MOONSHOT_BASE_URL`, `MOONSHOT_MODEL` | Kimi explanations (template fallback without a key) |
| `BLOB_READ_WRITE_TOKEN` | Durable cross-device vault storage (Vercel Blob). Without it the vault lives in server memory + localStorage. |

### Indexer

```bash
cd indexer
npm install
npm run codegen
ENVIO_API_TOKEN=... npm run dev   # local (needs Docker), or deploy to Envio Cloud from GitHub
```

## Stack

Next.js 15, React 19, framer-motion, viem, `@category-labs/mera`, Envio HyperIndex 3, Vercel Blob. Contract addresses: Perpl Exchange `0x1964C32f0bE608E7D29302AFF5E61268E72080cc`, aUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` (Monad testnet 10143).

## Known limits (honest list)

- Autopilot runs while the app is open. There is no server holding your key, by design.
- Mera sessions don't natively scope permissions, so limits are enforced by Coattail's engine, not by the chain.
- The leaderboard's drawdown is realized-PnL drawdown relative to deposits, not mark-to-market.
