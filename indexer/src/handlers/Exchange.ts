import { indexer, type EvmOnEventContext, type Trader } from "envio";

/**
 * Perpl emits positions by accountId only, so we:
 *  1. map accountId -> address from AccountCreated
 *  2. learn each market's decimals from ContractAdded(V2)
 *  3. fold Position* events into a Trade stream + per-trader performance stats
 */

const COLLATERAL_DECIMALS = 6;
const toCollat = (v: bigint) => Number(v) / 10 ** COLLATERAL_DECIMALS;
const sideOf = (positionType: bigint) => (positionType === 2n ? "short" : "long");

type Ctx = EvmOnEventContext;

async function market(context: Ctx, perpId: bigint) {
  const m = await context.Market.get(perpId.toString());
  return m ?? { id: perpId.toString(), symbol: `PERP-${perpId}`, priceDecimals: 0, lotDecimals: 0 };
}

async function traderFor(context: Ctx, accountId: bigint): Promise<Trader | undefined> {
  const acc = await context.PerplAccount.get(accountId.toString());
  if (!acc) return undefined;
  const existing = await context.Trader.get(acc.address);
  return (
    existing ?? {
      id: acc.address,
      accountId,
      trades: 0,
      wins: 0,
      losses: 0,
      grossProfit: 0,
      grossLoss: 0,
      realizedPnl: 0,
      peakPnl: 0,
      deposited: 0,
      maxDrawdown: 0,
      sumLeverage: 0,
      favMarket: undefined,
      favCount: 0,
      lastTradeAt: 0,
    }
  );
}

/* ------------------------------------------------------------ reference data */

indexer.onEvent({ contract: "Exchange", event: "AccountCreated" }, async ({ event, context }) => {
  context.PerplAccount.set({ id: event.params.id.toString(), address: event.params.account.toLowerCase() });
});

for (const ev of ["ContractAdded", "ContractAddedV2"] as const) {
  indexer.onEvent({ contract: "Exchange", event: ev }, async ({ event, context }) => {
    context.Market.set({
      id: event.params.perpId.toString(),
      symbol: event.params.symbol || event.params.name,
      priceDecimals: Number(event.params.priceDecimals),
      lotDecimals: Number(event.params.lotDecimals),
    });
  });
}

indexer.onEvent({ contract: "Exchange", event: "CollateralDeposit" }, async ({ event, context }) => {
  const t = await traderFor(context, event.params.accountId);
  if (!t) return;
  context.Trader.set({ ...t, deposited: t.deposited + toCollat(event.params.amountCNS) });
});

/* ------------------------------------------------------------ opens */

async function onOpen(
  context: Ctx,
  ev: { chainId: number; logIndex: number; block: { number: number; timestamp: number }; transaction: { hash: string } },
  p: { perpId: bigint; accountId: bigint; positionType: bigint; leverageHdths: bigint; pricePNS: bigint; lot: bigint },
) {
  const t = await traderFor(context, p.accountId);
  if (!t) return;
  const m = await market(context, p.perpId);
  const price = Number(p.pricePNS) / 10 ** m.priceDecimals;
  const size = Number(p.lot) / 10 ** m.lotDecimals;
  const leverage = Number(p.leverageHdths) / 100;
  const side = sideOf(p.positionType);

  context.OpenPosition.set({ id: `${p.accountId}-${p.perpId}`, side, size, leverage });

  const tmId = `${t.id}-${p.perpId}`;
  const tm = await context.TraderMarket.get(tmId);
  const count = (tm?.count ?? 0) + 1;
  context.TraderMarket.set({ id: tmId, count });

  context.Trader.set({
    ...t,
    trades: t.trades + 1,
    sumLeverage: t.sumLeverage + leverage,
    favMarket: count > t.favCount ? m.symbol : t.favMarket,
    favCount: Math.max(count, t.favCount),
    lastTradeAt: ev.block.timestamp,
  });

  context.Trade.set({
    id: `${ev.chainId}-${ev.block.number}-${ev.logIndex}`,
    trader: t.id,
    accountId: p.accountId,
    perpId: Number(p.perpId),
    market: m.symbol,
    side,
    action: "open",
    price,
    size,
    leverage,
    pnl: 0,
    timestamp: ev.block.timestamp,
    txHash: ev.transaction.hash,
  });
}

indexer.onEvent({ contract: "Exchange", event: "PositionOpened" }, async ({ event, context }) =>
  onOpen(context, event, { ...event.params, lot: event.params.lotLNS }),
);
indexer.onEvent({ contract: "Exchange", event: "PositionOpenedV2" }, async ({ event, context }) =>
  onOpen(context, event, { ...event.params, lot: event.params.lotLNS }),
);
indexer.onEvent({ contract: "Exchange", event: "PositionIncreased" }, async ({ event, context }) =>
  onOpen(context, event, { ...event.params, lot: event.params.endLotLNS - event.params.startLotLNS }),
);
indexer.onEvent({ contract: "Exchange", event: "PositionIncreasedV2" }, async ({ event, context }) =>
  onOpen(context, event, { ...event.params, lot: event.params.endLotLNS - event.params.startLotLNS }),
);

/* ------------------------------------------------------------ closes */

async function onClose(
  context: Ctx,
  ev: { chainId: number; logIndex: number; block: { number: number; timestamp: number }; transaction: { hash: string } },
  p: { perpId: bigint; accountId: bigint; positionType: bigint; pricePNS: bigint; pnlCNS: bigint; fully: boolean },
) {
  const t = await traderFor(context, p.accountId);
  if (!t) return;
  const m = await market(context, p.perpId);
  const pnl = toCollat(p.pnlCNS);
  const posId = `${p.accountId}-${p.perpId}`;
  const pos = await context.OpenPosition.get(posId);

  const realizedPnl = t.realizedPnl + pnl;
  const peakPnl = Math.max(t.peakPnl, realizedPnl);
  const dd = t.deposited > 0 ? Math.min(1, Math.max(0, (peakPnl - realizedPnl) / t.deposited)) : t.maxDrawdown;

  context.Trader.set({
    ...t,
    wins: t.wins + (pnl > 0 ? 1 : 0),
    losses: t.losses + (pnl < 0 ? 1 : 0),
    grossProfit: t.grossProfit + Math.max(0, pnl),
    grossLoss: t.grossLoss + Math.max(0, -pnl),
    realizedPnl,
    peakPnl,
    maxDrawdown: Math.max(t.maxDrawdown, dd),
    lastTradeAt: ev.block.timestamp,
  });

  // Only a full exit is a "close" in the copy stream; partial trims just update stats.
  if (!p.fully) return;
  context.OpenPosition.deleteUnsafe(posId);
  context.Trade.set({
    id: `${ev.chainId}-${ev.block.number}-${ev.logIndex}`,
    trader: t.id,
    accountId: p.accountId,
    perpId: Number(p.perpId),
    market: m.symbol,
    side: pos?.side ?? sideOf(p.positionType),
    action: "close",
    price: Number(p.pricePNS) / 10 ** m.priceDecimals,
    size: pos?.size ?? 0,
    leverage: pos?.leverage ?? 1,
    pnl,
    timestamp: ev.block.timestamp,
    txHash: ev.transaction.hash,
  });
}

indexer.onEvent({ contract: "Exchange", event: "PositionClosed" }, async ({ event, context }) =>
  onClose(context, event, { ...event.params, pnlCNS: event.params.deltaPnlCNS + event.params.fundingCNS, fully: true }),
);
indexer.onEvent({ contract: "Exchange", event: "PositionDecreased" }, async ({ event, context }) =>
  onClose(context, event, {
    ...event.params,
    pricePNS: 0n,
    pnlCNS: event.params.deltaPnlCNS + event.params.fundingCNS,
    fully: event.params.endLotLNS === 0n,
  }),
);
indexer.onEvent({ contract: "Exchange", event: "PositionLiquidated" }, async ({ event, context }) =>
  onClose(context, event, {
    perpId: event.params.perpId,
    accountId: event.params.posAccountId,
    positionType: event.params.positionType,
    pricePNS: event.params.liqPricePNS,
    pnlCNS: event.params.deltaPnlCNS + event.params.fundingCNS,
    fully: event.params.liqLotLNS >= event.params.posLotLNS,
  }),
);
