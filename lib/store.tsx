"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { DEMO_TRADERS, demoTradeFor, fetchRecentTrades, fetchTradesSince, fetchTraders } from "./data";
import { decide, defaultPolicy, type EngineState } from "./engine";
import {
  depositToPerpl,
  ORDER,
  readMarkets,
  readMon,
  readPerplAccount,
  readPosition,
  readWalletAusd,
  sendOrder,
  usdToLot,
  withdrawFromPerpl,
  type PerplAccount,
} from "./perpl";
import type { CopyRecord, Goal, LeaderTrade, Market, Policy, Trader } from "./types";
import { lockVault, pullVault, pushVault, unlockVault, vaultUnlocked } from "./vault";
import {
  activeWallet,
  createWallet,
  disconnect as walletDisconnect,
  endSession,
  ensureSession,
  friendlyError,
  onSessionChange,
  sessionExpiresAt,
  signIn,
  storedAddress,
  storedCredential,
} from "./wallet";

export type Stage = "welcome" | "goals" | "trader" | "limits" | "note" | "stamp" | "home";
export interface Note {
  id: string;
  text: string;
  at: number;
}
interface VaultPayload {
  goals: Goal[];
  selected: Address | null;
  policy: Policy | null;
  notes: Note[];
  stamps: string[];
}

interface Ctx {
  ready: boolean;
  stage: Stage;
  go: (s: Stage) => void;
  address: Address | null;
  sessionLive: boolean;
  sessionLeftMs: number;
  busy: string | null;
  toast: string | null;
  setToast: (m: string | null) => void;
  // account
  createAccount: () => Promise<boolean>;
  signInExisting: () => Promise<boolean>;
  disconnect: () => void;
  // profile
  goals: Goal[];
  setGoals: (g: Goal[]) => void;
  traders: Trader[];
  tradersLive: boolean;
  selected: Trader | null;
  select: (t: Trader | null) => void;
  policy: Policy | null;
  setPolicy: (p: Policy) => void;
  notes: Note[];
  stamps: string[];
  // chain
  mon: number;
  ausd: number;
  perplAccount: PerplAccount | null;
  markets: Market[];
  refresh: () => Promise<void>;
  deposit: (usd: number) => Promise<boolean>;
  withdraw: (usd: number) => Promise<boolean>;
  // autopilot
  autopilot: boolean;
  practice: boolean;
  feed: CopyRecord[];
  leaderFeed: LeaderTrade[];
  startAutopilot: () => Promise<void>;
  stopAutopilot: () => void;
  // vault
  vaultOpen: boolean;
  saveNote: (text: string) => Promise<boolean>;
  restoreSpace: () => Promise<boolean>;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error("AppProvider missing");
  return v;
};

const LS = "coattail.profile";
const PRACTICE_BALANCE = 500;

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<Stage>("welcome");
  const [address, setAddress] = useState<Address | null>(null);
  const [sessionLive, setSessionLive] = useState(false);
  const [sessionLeftMs, setSessionLeftMs] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [goals, setGoalsState] = useState<Goal[]>([]);
  const [traders, setTraders] = useState<Trader[]>(DEMO_TRADERS);
  const [tradersLive, setTradersLive] = useState(false);
  const [selectedAddr, setSelectedAddr] = useState<Address | null>(null);
  const [policy, setPolicyState] = useState<Policy | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stamps, setStamps] = useState<string[]>([]);

  const [mon, setMon] = useState(0);
  const [ausd, setAusd] = useState(0);
  const [perplAccount, setPerplAccount] = useState<PerplAccount | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);

  const [autopilot, setAutopilot] = useState(false);
  const [feed, setFeed] = useState<CopyRecord[]>([]);
  const [leaderFeed, setLeaderFeed] = useState<LeaderTrade[]>([]);
  const [vaultOpen, setVaultOpen] = useState(false);

  const selected = useMemo(() => traders.find((t) => t.address === selectedAddr) ?? null, [traders, selectedAddr]);
  const practice = !(selected?.source === "envio" && perplAccount && markets.length > 0);

  /* ---------------------------------------------------------------- persistence */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS);
      const addr = storedAddress();
      if (addr && raw) {
        const p = JSON.parse(raw);
        setAddress(addr);
        setStage(p.stage ?? "home");
        setGoalsState(p.goals ?? []);
        setSelectedAddr(p.selected ?? null);
        setPolicyState(p.policy ?? null);
        setFeed(p.feed ?? []);
        setNotes(p.notes ?? []);
        setStamps(p.stamps ?? []);
      } else if (addr) {
        setAddress(addr);
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !address) return;
    try {
      localStorage.setItem(LS, JSON.stringify({ stage, goals, selected: selectedAddr, policy, feed: feed.slice(0, 60), notes, stamps }));
    } catch {}
  }, [ready, address, stage, goals, selectedAddr, policy, feed, notes, stamps]);

  /* ---------------------------------------------------------------- session clock */
  useEffect(() => {
    const off = onSessionChange(() => setSessionLive(activeWallet() !== null));
    const t = setInterval(() => {
      const left = Math.max(0, sessionExpiresAt() - Date.now());
      setSessionLeftMs(left);
      setSessionLive(left > 0);
    }, 1000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  /* ---------------------------------------------------------------- chain reads */
  const lastMon = useRef<number | null>(null);
  const lastAusd = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (!address) return;
    // Each read is independent: one failing (e.g. no Perpl account yet) must not hide the others.
    const [m, a, acc] = await Promise.allSettled([readMon(address), readWalletAusd(address), readPerplAccount(address)]);
    if (m.status === "fulfilled") {
      if (lastMon.current !== null && m.value > lastMon.current + 1e-9) setToast(`Received ${(m.value - lastMon.current).toFixed(3)} MON.`);
      lastMon.current = m.value;
      setMon(m.value);
    }
    if (a.status === "fulfilled") {
      if (lastAusd.current !== null && a.value > lastAusd.current + 1e-9) setToast(`Received $${(a.value - lastAusd.current).toFixed(2)} aUSD.`);
      lastAusd.current = a.value;
      setAusd(a.value);
    }
    if (acc.status === "fulfilled") setPerplAccount(acc.value);
    try {
      if (!markets.length) setMarkets(await readMarkets());
    } catch {}
  }, [address, markets.length]);

  useEffect(() => {
    if (!address) return;
    lastMon.current = null;
    lastAusd.current = null;
    refresh();
    // Poll while visible, and re-read the moment the app comes back (e.g. returning from the faucet).
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 8_000);
    const onWake = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("pageshow", onWake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("pageshow", onWake);
    };
  }, [address, refresh]);

  useEffect(() => {
    let alive = true;
    fetchTraders().then(async (r) => {
      if (!alive) return;
      // Nansen enrichment (server-side key). Cached 6h server-side; failures are silent.
      const top = r.traders.slice(0, 6);
      const tagged = await Promise.all(
        top.map(async (t) => {
          const j = await fetch(`/api/nansen?address=${t.address}`).then((x) => x.json()).catch(() => null);
          return j?.smartMoney ? { ...t, stats: { ...t.stats, smartMoney: true } } : t;
        }),
      );
      setTraders([...tagged, ...r.traders.slice(6)]);
      setTradersLive(r.live);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------------------------------------------------------- account actions */
  const finishConnect = useCallback((addr: Address) => {
    setAddress(addr);
    setSessionLive(true);
  }, []);

  const createAccount = useCallback(async () => {
    setBusy("connect");
    try {
      const { address: a } = await createWallet();
      finishConnect(a);
      return true;
    } catch (e) {
      setToast(friendlyError(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, [finishConnect]);

  const signInExisting = useCallback(async () => {
    setBusy("connect");
    try {
      const { address: a } = await signIn();
      finishConnect(a);
      const hadLocal = !!localStorage.getItem(LS);
      setStage(hadLocal ? "home" : "goals");
      return true;
    } catch (e) {
      setToast(friendlyError(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, [finishConnect]);

  const disconnect = useCallback(() => {
    walletDisconnect();
    lockVault();
    setAutopilot(false);
    setAddress(null);
    setSessionLive(false);
    setGoalsState([]);
    setSelectedAddr(null);
    setPolicyState(null);
    setFeed([]);
    setLeaderFeed([]);
    setNotes([]);
    setStamps([]);
    setMon(0);
    setAusd(0);
    setPerplAccount(null);
    setVaultOpen(false);
    setStage("welcome");
  }, []);

  /* ---------------------------------------------------------------- vault (PRF namespace #2) */
  const syncVault = useCallback(
    async (next: Partial<VaultPayload>) => {
      if (!vaultUnlocked()) return;
      const payload: VaultPayload = { goals, selected: selectedAddr, policy, notes, stamps, ...next };
      await pushVault(payload).catch(() => null);
    },
    [goals, selectedAddr, policy, notes, stamps],
  );

  const saveNote = useCallback(
    async (text: string) => {
      setBusy("vault");
      try {
        await unlockVault(storedCredential());
        setVaultOpen(true);
        const n: Note = { id: crypto.randomUUID(), text: text.trim(), at: Date.now() };
        const next = [n, ...notes];
        setNotes(next);
        await syncVault({ notes: next });
        return true;
      } catch (e) {
        setToast(friendlyError(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [notes, syncVault],
  );

  const restoreSpace = useCallback(async () => {
    setBusy("vault");
    try {
      await unlockVault(storedCredential());
      setVaultOpen(true);
      const v = await pullVault<VaultPayload>();
      if (!v) {
        setToast("Nothing saved for this passkey yet.");
        return false;
      }
      setGoalsState(v.goals ?? []);
      setSelectedAddr(v.selected ?? null);
      setPolicyState(v.policy ?? null);
      setNotes(v.notes ?? []);
      setStamps(v.stamps ?? []);
      if (v.policy) setStage("home");
      setToast("Welcome back. Your space was rebuilt from your passkey.");
      return true;
    } catch (e) {
      setToast(friendlyError(e));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  /* ---------------------------------------------------------------- setters that also sync */
  const setGoals = useCallback(
    (g: Goal[]) => {
      setGoalsState(g);
      void syncVault({ goals: g });
    },
    [syncVault],
  );
  const select = useCallback(
    (t: Trader | null) => {
      setSelectedAddr(t?.address ?? null);
      void syncVault({ selected: t?.address ?? null });
    },
    [syncVault],
  );
  const setPolicy = useCallback(
    (p: Policy) => {
      setPolicyState(p);
      void syncVault({ policy: p });
    },
    [syncVault],
  );

  /* ---------------------------------------------------------------- money in / out */
  const deposit = useCallback(
    async (usd: number) => {
      if (!address) return false;
      setBusy("deposit");
      try {
        const w = await ensureSession(15);
        await depositToPerpl(w, address, usd, !!perplAccount);
        await refresh();
        setToast(perplAccount ? `Added $${usd} to your trading balance.` : "Trading account opened.");
        return true;
      } catch (e) {
        setToast(friendlyError(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [address, perplAccount, refresh],
  );

  const withdraw = useCallback(
    async (usd: number) => {
      setBusy("withdraw");
      try {
        const w = await ensureSession(15);
        await withdrawFromPerpl(w, usd);
        await refresh();
        setToast(`Moved $${usd} back to your wallet.`);
        return true;
      } catch (e) {
        setToast(friendlyError(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  /* ---------------------------------------------------------------- autopilot loop */
  const mirrored = useRef(new Map<string, { side: "long" | "short"; perpId: number }>());
  const lastSeen = useRef(Math.floor(Date.now() / 1000));
  const equityStart = useRef(0);
  const demoOpen = useRef(new Map<string, LeaderTrade>());
  const running = useRef(false);

  const patchRecord = useCallback((id: string, patch: Partial<CopyRecord>) => {
    setFeed((f) => f.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const explain = useCallback(
    async (rec: CopyRecord, t: LeaderTrade, d: ReturnType<typeof decide>, p: Policy) => {
      const body = {
        kind: "trade",
        trade: { action: t.action, side: t.side, market: t.market, leverage: t.leverage },
        decision: d.kind === "copy" ? { kind: "copy", sizeUsd: d.sizeUsd, leverage: d.leverage } : d.kind === "close" ? { kind: "close" } : { kind: "skip", reason: d.reason },
        policy: { maxPerTradeUsd: p.maxPerTradeUsd, maxLeverage: p.maxLeverage, stopLossPct: p.stopLossPct },
      };
      const j = await fetch("/api/explain", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
      if (j?.text) patchRecord(rec.id, { explain: j.text });
    },
    [patchRecord],
  );

  const handleLeaderTrade = useCallback(
    async (t: LeaderTrade) => {
      if (!policy) return;
      setLeaderFeed((l) => [t, ...l].slice(0, 30));
      const real = !practice;
      const freeCollateral = real ? (perplAccount?.balance ?? 0) - (perplAccount?.locked ?? 0) : PRACTICE_BALANCE;
      const state: EngineState = {
        sessionOpen: real ? activeWallet() !== null : true,
        equityStart: equityStart.current,
        equityNow: real ? (perplAccount?.balance ?? 0) : PRACTICE_BALANCE,
        mirrored: new Set(mirrored.current.keys()),
        freeCollateral,
      };
      const d = decide(t, policy, state);
      const base: CopyRecord = {
        id: crypto.randomUUID(),
        leaderTradeId: t.id,
        market: t.market,
        side: t.side,
        action: t.action,
        sizeUsd: d.kind === "copy" ? d.sizeUsd : 0,
        leverage: d.kind === "copy" ? d.leverage : t.leverage,
        status: d.kind === "skip" ? "skipped" : real ? "sent" : "simulated",
        reason: d.kind === "skip" ? d.reason : undefined,
        at: Date.now(),
      };
      setFeed((f) => [base, ...f]);
      void explain(base, t, d, policy);
      if (d.kind === "skip") return;

      if (!real) {
        if (d.kind === "copy") mirrored.current.set(t.market, { side: t.side, perpId: t.perpId });
        else mirrored.current.delete(t.market);
        return;
      }

      try {
        const wallet = activeWallet();
        if (!wallet) throw new Error("Autopilot window ended");
        const market = markets.find((m) => m.perpId === t.perpId);
        if (!market) throw new Error(`Unknown market ${t.market}`);
        let hash: string;
        if (d.kind === "copy") {
          const lot = usdToLot(market, d.sizeUsd);
          if (lot <= 0n) throw new Error("Size rounds to zero");
          hash = await sendOrder(wallet, { market, type: t.side === "long" ? ORDER.OpenLong : ORDER.OpenShort, lot, leverage: d.leverage });
          mirrored.current.set(t.market, { side: t.side, perpId: t.perpId });
        } else {
          const m = mirrored.current.get(t.market)!;
          const pos = await readPosition(m.perpId, perplAccount!.accountId);
          if (pos.type === 0 || pos.lot === 0n) {
            mirrored.current.delete(t.market);
            throw new Error("Position already closed");
          }
          hash = await sendOrder(wallet, { market, type: m.side === "long" ? ORDER.CloseLong : ORDER.CloseShort, lot: pos.lot, leverage: 1 });
          mirrored.current.delete(t.market);
        }
        patchRecord(base.id, { status: "confirmed", txHash: hash });
        void refresh();
      } catch (e) {
        patchRecord(base.id, { status: "failed", reason: friendlyError(e) });
      }
    },
    [policy, practice, perplAccount, markets, explain, patchRecord, refresh],
  );

  const handleRef = useRef(handleLeaderTrade);
  handleRef.current = handleLeaderTrade;

  const startAutopilot = useCallback(async () => {
    if (!policy || !selected) return;
    try {
      if (!practice) {
        await ensureSession(policy.sessionMinutes);
        // adopt any mirrored positions already open on-chain
        mirrored.current.clear();
        for (const m of markets) {
          const pos = await readPosition(m.perpId, perplAccount!.accountId).catch(() => null);
          if (pos && pos.type !== 0 && pos.lot > 0n) mirrored.current.set(m.symbol, { side: pos.type === 1 ? "long" : "short", perpId: m.perpId });
        }
        const recent = await fetchRecentTrades(selected.address, 8).catch(() => []);
        setLeaderFeed(recent);
      }
      equityStart.current = practice ? PRACTICE_BALANCE : (perplAccount?.balance ?? 0);
      lastSeen.current = Math.floor(Date.now() / 1000);
      setPolicyState({ ...policy, startedAt: Date.now() });
      setAutopilot(true);
      setStamps((s) => (s.includes("first-follow") ? s : [...s, "first-follow"]));
    } catch (e) {
      setToast(friendlyError(e));
    }
  }, [policy, selected, practice, markets, perplAccount]);

  const stopAutopilot = useCallback(() => {
    setAutopilot(false);
    endSession();
  }, []);

  useEffect(() => {
    if (!autopilot || !selected || !policy) return;
    let stop = false;
    const tick = async () => {
      if (running.current || stop) return;
      running.current = true;
      try {
        // window over? stop the loop; the next tap re-prompts Face ID
        if (policy.startedAt && Date.now() > policy.startedAt + policy.sessionMinutes * 60_000) {
          setAutopilot(false);
          setToast("Autopilot window ended. Tap Resume to start another.");
          return;
        }
        if (selected.source === "envio") {
          const trades = await fetchTradesSince(selected.address, lastSeen.current);
          for (const t of trades) {
            lastSeen.current = Math.max(lastSeen.current, Math.floor(t.at / 1000));
            await handleRef.current(t);
          }
        } else if (Math.random() < 0.45) {
          const dt = demoTradeFor(selected, demoOpen.current);
          // keep the demo's open-position book in step so closes follow opens
          if (dt.action === "open") demoOpen.current.set(dt.market, dt);
          else demoOpen.current.delete(dt.market);
          await handleRef.current(dt);
        }
      } catch {
        /* transient — try again next tick */
      } finally {
        running.current = false;
      }
    };
    const iv = setInterval(tick, selected.source === "envio" ? 4000 : 6000);
    void tick();
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [autopilot, selected, policy]);

  // demo traders: remember their open positions so we emit a matching close later
  useEffect(() => {
    demoOpen.current.clear();
  }, [selectedAddr]);

  const value: Ctx = {
    ready,
    stage,
    go: setStage,
    address,
    sessionLive,
    sessionLeftMs,
    busy,
    toast,
    setToast,
    createAccount,
    signInExisting,
    disconnect,
    goals,
    setGoals,
    traders,
    tradersLive,
    selected,
    select,
    policy,
    setPolicy,
    notes,
    stamps,
    mon,
    ausd,
    perplAccount,
    markets,
    refresh,
    deposit,
    withdraw,
    autopilot,
    practice,
    feed,
    leaderFeed,
    startAutopilot,
    stopAutopilot,
    vaultOpen,
    saveNote,
    restoreSpace,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export { defaultPolicy };
