import { formatUnits, parseUnits, type Address, type WalletClient } from "viem";
import { exchangeAbi, erc20Abi } from "./abi";
import { CHAIN, PERPL, publicClient } from "./config";
import type { Market } from "./types";

/** Order types from the Perpl WebSocket/contract docs. */
export const ORDER = { OpenLong: 1, OpenShort: 2, CloseLong: 3, CloseShort: 4 } as const;

const pow10 = (n: number) => 10 ** n;

/** Reads every live perpetual straight from the Exchange contract. */
export async function readMarkets(): Promise<Market[]> {
  // Four 256-bit banks → perp ids 0..1023
  const banks = await publicClient.readContract({
    address: PERPL.exchange,
    abi: exchangeAbi,
    functionName: "getPerpetualExistsBitmap",
  });
  const ids: number[] = [];
  banks.forEach((bank, b) => {
    for (let i = 0; i < 256; i++) if ((bank >> BigInt(i)) & 1n) ids.push(b * 256 + i);
  });

  const infos = await Promise.all(
    ids.map((perpId) =>
      publicClient
        .readContract({ address: PERPL.exchange, abi: exchangeAbi, functionName: "getPerpetualInfo", args: [BigInt(perpId)] })
        .then((info) => ({ perpId, info }))
        .catch(() => null),
    ),
  );
  return infos
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map(({ perpId, info }) => {
      const priceDecimals = Number(info.priceDecimals);
      return {
        perpId,
        symbol: info.symbol || info.name,
        priceDecimals,
        lotDecimals: Number(info.lotDecimals),
        mark: Number(info.markPNS) / pow10(priceDecimals),
        maxLeverage: 20,
      };
    })
    .filter((m) => m.mark > 0);
}

export interface PerplAccount {
  accountId: bigint;
  balance: number; // collateral inside Perpl
  locked: number;
}

export async function readPerplAccount(address: Address): Promise<PerplAccount | null> {
  const acc = await publicClient.readContract({
    address: PERPL.exchange,
    abi: exchangeAbi,
    functionName: "getAccountByAddr",
    args: [address],
  });
  if (!acc.accountId || acc.accountId === 0n) return null;
  return {
    accountId: acc.accountId,
    balance: Number(formatUnits(acc.balanceCNS, PERPL.collateralDecimals)),
    locked: Number(formatUnits(acc.lockedBalanceCNS, PERPL.collateralDecimals)),
  };
}

export async function readWalletAusd(address: Address): Promise<number> {
  const raw = await publicClient.readContract({ address: PERPL.collateral, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  return Number(formatUnits(raw, PERPL.collateralDecimals));
}

export async function readMon(address: Address): Promise<number> {
  return Number(formatUnits(await publicClient.getBalance({ address }), 18));
}

export async function readPosition(perpId: number, accountId: bigint) {
  const [pos, mark] = await publicClient.readContract({
    address: PERPL.exchange,
    abi: exchangeAbi,
    functionName: "getPositionV2",
    args: [BigInt(perpId), accountId],
  });
  return { type: Number(pos.positionType) as 0 | 1 | 2, lot: pos.lotLNS, price: pos.pricePNS, deposit: pos.depositCNS, pnl: pos.pnlCNS, mark };
}

async function ensureAllowance(wallet: WalletClient, owner: Address, amount: bigint) {
  const allowance = await publicClient.readContract({
    address: PERPL.collateral,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, PERPL.exchange],
  });
  if (allowance >= amount) return;
  const hash = await wallet.writeContract({
    account: wallet.account!,
    chain: CHAIN,
    address: PERPL.collateral,
    abi: erc20Abi,
    functionName: "approve",
    args: [PERPL.exchange, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/** First deposit opens the Perpl account; later deposits top it up. */
export async function depositToPerpl(wallet: WalletClient, owner: Address, usdAmount: number, hasAccount: boolean) {
  const amount = parseUnits(usdAmount.toFixed(PERPL.collateralDecimals), PERPL.collateralDecimals);
  await ensureAllowance(wallet, owner, amount);
  const hash = await wallet.writeContract({
    account: wallet.account!,
    chain: CHAIN,
    address: PERPL.exchange,
    abi: exchangeAbi,
    functionName: hasAccount ? "depositCollateral" : "createAccount",
    args: [amount],
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function withdrawFromPerpl(wallet: WalletClient, usdAmount: number) {
  const amount = parseUnits(usdAmount.toFixed(PERPL.collateralDecimals), PERPL.collateralDecimals);
  const hash = await wallet.writeContract({
    account: wallet.account!,
    chain: CHAIN,
    address: PERPL.exchange,
    abi: exchangeAbi,
    functionName: "withdrawCollateral",
    args: [amount],
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

interface OrderInput {
  market: Market;
  type: (typeof ORDER)[keyof typeof ORDER];
  lot: bigint;
  leverage: number;
  slippageBps?: number;
}

/**
 * Immediate-or-cancel order at mark ± slippage: behaves like a market order but can never
 * fill worse than the bound. Sent straight to the Exchange — msg.sender is the account.
 */
export async function sendOrder(wallet: WalletClient, o: OrderInput) {
  const slip = (o.slippageBps ?? 100) / 10_000;
  const buying = o.type === ORDER.OpenLong || o.type === ORDER.CloseShort;
  const bound = o.market.mark * (buying ? 1 + slip : 1 - slip);
  const pricePNS = BigInt(Math.round(bound * pow10(o.market.priceDecimals)));

  const hash = await wallet.writeContract({
    account: wallet.account!,
    chain: CHAIN,
    address: PERPL.exchange,
    abi: exchangeAbi,
    functionName: "execOrder",
    args: [
      {
        orderDescId: BigInt(Date.now()),
        perpId: BigInt(o.market.perpId),
        orderType: o.type,
        orderId: 0n,
        pricePNS,
        lotLNS: o.lot,
        expiryBlock: 0n,
        postOnly: false,
        fillOrKill: false,
        immediateOrCancel: true,
        maxMatches: 0n,
        leverageHdths: BigInt(Math.round(o.leverage * 100)),
        lastExecutionBlock: 0n,
        amountCNS: 0n,
        maxNegPnlCollatBPS: 1000n,
      },
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Order reverted on-chain");
  return hash;
}

/** USD notional → lot size in the market's lot units (floored so we never exceed the cap). */
export function usdToLot(market: Market, usd: number): bigint {
  const base = usd / market.mark;
  return BigInt(Math.floor(base * pow10(market.lotDecimals)));
}
