import { createPublicClient, fallback, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";

export const CHAIN = monadTestnet;

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY;
export const RPC_URL = alchemyKey
  ? `https://monad-testnet.g.alchemy.com/v2/${alchemyKey}`
  : "https://testnet-rpc.monad.xyz";
export const RPC_PROVIDER = alchemyKey ? "alchemy" : "public";

// Perpl testnet — from docs.perpl.xyz/resources/for-developers/networks-and-configuration
export const PERPL = {
  exchange: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc" as Address,
  collateral: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC" as Address,
  collateralDecimals: 6,
  api: "https://testnet.perpl.xyz/api",
  explorer: "https://testnet.monadvision.com",
} as const;

export const ENVIO_URL = process.env.NEXT_PUBLIC_ENVIO_URL ?? "";

const PUBLIC_RPC = "https://testnet-rpc.monad.xyz";
// Alchemy first, public Monad RPC as backup so a bad/unenabled key never leaves balances stuck at 0.
export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: RPC_URL === PUBLIC_RPC ? http(PUBLIC_RPC) : fallback([http(RPC_URL), http(PUBLIC_RPC)]),
});

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const usd = (n: number, d = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
