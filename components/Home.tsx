"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PERPL, short, usd } from "../lib/config";
import { defaultPolicy } from "../lib/engine";
import { useApp, type Note } from "../lib/store";
import type { CopyRecord, Trader } from "../lib/types";
import { Buddy, VIBE_BG, VIBE_LABEL } from "./Buddy";
import { AiRead, PolicyForm, rank, StampArt, TraderStats } from "./Onboarding";
import { Button, Count, Sheet, spring } from "./ui";

type Tab = "today" | "traders" | "activity" | "me";

const ICONS: Record<Tab, ReactNode> = {
  today: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  traders: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  me: <path d="M12 3a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />,
};
const LABEL: Record<Tab, string> = { today: "Today", traders: "Traders", activity: "Activity", me: "Me" };

export function Home() {
  const [tab, setTab] = useState<Tab>("today");
  return (
    <motion.div className="screen" style={{ paddingBottom: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="scroll" style={{ margin: "0 -22px", padding: "0 22px 18px" }}>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {tab === "today" && <Today goTab={setTab} />}
            {tab === "traders" && <Traders />}
            {tab === "activity" && <Activity />}
            {tab === "me" && <Me />}
          </motion.div>
        </AnimatePresence>
      </div>
      <LayoutGroup>
        <nav className="tabbar">
          {(Object.keys(ICONS) as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
              {tab === t && <motion.span layoutId="pill" transition={spring} style={{ position: "absolute", inset: 0, borderRadius: 22, background: "rgba(255,255,255,.14)" }} />}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative" }}>
                {ICONS[t]}
              </svg>
              <span style={{ position: "relative" }}>{LABEL[t]}</span>
            </button>
          ))}
        </nav>
      </LayoutGroup>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ shared bits */

const ago = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 16px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em" }}>{children}</h1>
      {right}
    </div>
  );
}

function StatusChip({ r }: { r: CopyRecord }) {
  const map: Record<CopyRecord["status"], [string, string, string]> = {
    confirmed: ["Confirmed", "var(--green-soft)", "var(--up)"],
    sent: ["Sending…", "var(--yellow-soft)", "#9a7600"],
    simulated: ["Practice", "var(--purple-soft)", "var(--purple)"],
    skipped: ["Skipped", "var(--card)", "var(--ink-3)"],
    failed: ["Failed", "var(--coral-soft)", "var(--down)"],
  };
  const [l, bg, c] = map[r.status];
  return <span className="chip" style={{ background: bg, color: c, fontSize: 10 }}>{l}</span>;
}

function FeedRow({ r }: { r: CopyRecord }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: -16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} className="card" style={{ padding: "13px 15px", display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>
          {r.action === "open" ? "Opened" : "Closed"} <span className={r.side === "long" ? "up" : "down"}>{r.side}</span> {r.market}
          {r.status !== "skipped" && r.action === "open" && <span style={{ color: "var(--ink-3)", fontWeight: 600 }}> · {usd(r.sizeUsd, 0)} · {r.leverage}x</span>}
        </div>
        <StatusChip r={r} />
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500, lineHeight: 1.35 }}>{r.explain ?? r.reason ?? "…"}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>
        <span>{ago(r.at)}</span>
        {r.txHash && (
          <a href={`${PERPL.explorer}/tx/${r.txHash}`} target="_blank" rel="noreferrer" style={{ color: "var(--ink-2)" }}>
            View on chain ↗
          </a>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ Today */

function Today({ goTab }: { goTab: (t: Tab) => void }) {
  const { address, selected, policy, autopilot, startAutopilot, stopAutopilot, ausd, mon, perplAccount, practice, sessionLeftMs, feed, busy, setToast } = useApp();
  const [fund, setFund] = useState(false);
  const left = policy?.startedAt ? Math.max(0, policy.startedAt + policy.sessionMinutes * 60_000 - Date.now()) : 0;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const trading = perplAccount?.balance ?? 0;
  const needsGas = mon < 0.05;
  const needsCash = ausd < 1 && !perplAccount;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageTitle
        right={
          <motion.div animate={{ background: autopilot ? "var(--green-soft)" : "var(--card)" }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>
            {autopilot ? <><span className="live-dot" /> Autopilot · <span className="num">{mmss(left)}</span></> : "Autopilot off"}
          </motion.div>
        }
      >
        Today
      </PageTitle>

      <motion.div className="card" style={{ padding: 20, background: "var(--ink)", color: "#fff" }} initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <div className="eyebrow" style={{ color: "#8d928f" }}>Trading balance</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.045em", margin: "2px 0 10px" }}>
          <Count value={practice ? 500 : trading} prefix="$" />
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 13, fontWeight: 600, color: "#b9bdbb" }}>
          <span>Wallet <b className="num" style={{ color: "#fff" }}>{usd(ausd)}</b></span>
          <span>Gas <b className="num" style={{ color: "#fff" }}>{mon.toFixed(2)} MON</b></span>
        </div>
        {practice && <div className="chip" style={{ marginTop: 12, background: "rgba(255,255,255,.12)", color: "#fff" }}>Practice balance</div>}
      </motion.div>

      <AnimatePresence>
        {(needsGas || needsCash) && address && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="card" style={{ padding: 16, background: "var(--yellow-soft)", display: "grid", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Fund your wallet to copy for real</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500, lineHeight: 1.4 }}>
                Until then everything runs as <b>practice</b>. Send testnet {needsGas && "MON for gas"}
                {needsGas && needsCash && " and "}
                {needsCash && "aUSD"} to your address.
              </div>
              <button
                className="btn ghost"
                style={{ height: 46, fontSize: 14, background: "#fff" }}
                onClick={() => {
                  void navigator.clipboard?.writeText(address);
                  setToast("Address copied.");
                }}
              >
                Copy {short(address)}
              </button>
              {needsGas && (
                <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, textAlign: "center", color: "var(--ink-2)" }}>
                  Get testnet MON ↗
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selected && (
        <motion.div className="card" style={{ padding: 16, background: VIBE_BG[selected.vibe], display: "grid", gap: 12 }} layout>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Buddy vibe={selected.vibe} size={70} wave={autopilot} />
            <div style={{ flex: 1 }}>
              <div className="eyebrow">Copying</div>
              <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.03em" }}>{selected.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
                {selected.stats.favMarket} · {selected.stats.avgLeverage}x typical
              </div>
            </div>
            <button className="chip" onClick={() => goTab("traders")}>Switch</button>
          </div>
          {policy && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[`≤ ${usd(policy.maxPerTradeUsd, 0)} / trade`, `≤ ${policy.maxLeverage}x`, `stop at -${policy.stopLossPct}%`].map((c) => (
                <span key={c} className="chip" style={{ fontSize: 10.5 }}>{c}</span>
              ))}
            </div>
          )}
          <Button busy={busy === "autopilot"} onClick={() => (autopilot ? stopAutopilot() : void startAutopilot())}>
            {autopilot ? "Pause autopilot" : policy?.startedAt ? "Resume autopilot" : "Start autopilot"}
          </Button>
          {!autopilot && !practice && <div className="fine" style={{ margin: 0 }}>Starts a {policy?.sessionMinutes}-minute window. No more prompts inside it.</div>}
        </motion.div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.03em" }}>Latest</h2>
        <button className="eyebrow" onClick={() => goTab("activity")}>See all</button>
      </div>
      {feed.length === 0 ? (
        <div className="card" style={{ padding: 22, textAlign: "center", color: "var(--ink-3)", fontWeight: 600, fontSize: 14 }}>
          {autopilot ? "Waiting for your trader to make a move…" : "Start autopilot and copies will show up here."}
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div style={{ display: "grid", gap: 10 }}>{feed.slice(0, 3).map((r) => <FeedRow key={r.id} r={r} />)}</div>
        </AnimatePresence>
      )}
      <span style={{ display: "none" }}>{sessionLeftMs}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Traders */

function Traders() {
  const { traders, goals, selected, select, policy, setPolicy, tradersLive } = useApp();
  const list = useMemo(() => rank(traders, goals), [traders, goals]);
  const [open, setOpen] = useState<Trader | null>(null);
  const [draft, setDraft] = useState(() => policy ?? defaultPolicy(list[0].address));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PageTitle right={<span className="chip" style={{ background: "var(--card)", color: "var(--ink-3)" }}>{tradersLive ? "Live · Envio" : "Demo data"}</span>}>Traders</PageTitle>
      {list.map((t, i) => (
        <motion.button key={t.address} className="card" onClick={() => setOpen(t)} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileTap={{ scale: 0.98 }} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: selected?.address === t.address ? VIBE_BG[t.vibe] : undefined }}>
          <Buddy vibe={t.vibe} size={58} delay={i * 0.2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em", display: "flex", gap: 6, alignItems: "center" }}>
              {t.name}
              {t.stats.smartMoney && <span className="chip" style={{ background: "var(--ink)", color: "#fff", fontSize: 9 }}>Smart money</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600 }}>
              {Math.round(t.stats.winRate * 100)}% wins · -{Math.round(t.stats.maxDrawdown * 100)}% worst dip · {t.stats.avgLeverage}x
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className={`num ${t.stats.pnl30d >= 0 ? "up" : "down"}`} style={{ fontWeight: 800, fontSize: 15 }}>{t.stats.pnl30d >= 0 ? "+" : ""}{usd(t.stats.pnl30d, 0)}</div>
            <div className="eyebrow" style={{ fontSize: 9 }}>30 days</div>
          </div>
        </motion.button>
      ))}

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <div style={{ display: "grid", gap: 12, maxHeight: "74dvh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Buddy vibe={open.vibe} size={84} wave />
              <div>
                <span className="chip" style={{ background: VIBE_BG[open.vibe] }}>{VIBE_LABEL[open.vibe]}</span>
                <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-0.03em" }}>{open.name}</div>
                <div className="num" style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>{short(open.address)} · {open.stats.trades} trades</div>
              </div>
            </div>
            <div style={{ background: VIBE_BG[open.vibe], borderRadius: 22, padding: 12, display: "grid", gap: 10 }}>
              <TraderStats t={open} />
              <AiRead t={open} />
            </div>
            <PolicyForm draft={draft} setDraft={setDraft} />
            <Button onClick={() => { select(open); setPolicy({ ...draft, traderAddress: open.address, startedAt: undefined }); setOpen(null); }}>
              {selected?.address === open.address ? "Update my limits" : `Copy ${open.name}`}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ Activity */

function Activity() {
  const { feed, leaderFeed, selected, autopilot } = useApp();
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PageTitle right={autopilot ? <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, fontWeight: 700 }}><span className="live-dot" /> Live</span> : undefined}>Activity</PageTitle>
      {feed.length === 0 && <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontWeight: 600 }}>Nothing yet. Every copy and every skip lands here, with the reason.</div>}
      <AnimatePresence initial={false}>{feed.map((r) => <FeedRow key={r.id} r={r} />)}</AnimatePresence>
      {leaderFeed.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 8 }}>What {selected?.name ?? "your trader"} did</h2>
          {leaderFeed.map((t) => (
            <div key={t.id} className="row" style={{ height: 52, fontSize: 14.5 }}>
              <span>{t.action === "open" ? "Opened" : "Closed"} <b className={t.side === "long" ? "up" : "down"}>{t.side}</b> {t.market} · {t.leverage}x</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{ago(t.at)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Me */

function Me() {
  const { address, ausd, mon, perplAccount, deposit, withdraw, busy, notes, saveNote, restoreSpace, vaultOpen, stamps, disconnect, setToast, practice, tradersLive } = useApp();
  const [money, setMoney] = useState<null | "deposit" | "withdraw">(null);
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const max = money === "deposit" ? ausd : (perplAccount?.balance ?? 0);
  const ok = Number(amount) > 0 && Number(amount) <= max;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageTitle>Me</PageTitle>

      <div className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
        <div className="eyebrow">Your wallet · Monad testnet</div>
        <button className="num" onClick={() => { void navigator.clipboard?.writeText(address ?? ""); setToast("Address copied."); }} style={{ fontWeight: 700, fontSize: 14.5, textAlign: "left", wordBreak: "break-all" }}>
          {address}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" style={{ height: 46, fontSize: 14, background: "#fff" }} onClick={() => setMoney("deposit")}>Add to trading</button>
          <button className="btn ghost" style={{ height: 46, fontSize: 14, background: "#fff" }} disabled={!perplAccount} onClick={() => setMoney("withdraw")}>Take out</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>
          Wallet {usd(ausd)} · Trading {usd(perplAccount?.balance ?? 0)} · {mon.toFixed(3)} MON
        </div>
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>Private notes</div>
          <span className="chip" style={{ background: vaultOpen ? "var(--green-soft)" : "var(--purple-soft)", color: vaultOpen ? "var(--up)" : "var(--purple)" }}>{vaultOpen ? "Unlocked" : "Locked"}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500, lineHeight: 1.4 }}>
          Encrypted with a second key from the same passkey. Open Coattail on a new device with your passkey and it all comes back.
        </div>
        {!vaultOpen ? (
          <Button busy={busy === "vault"} onClick={() => void restoreSpace()}>Unlock with Face ID</Button>
        ) : (
          <>
            <textarea className="field" placeholder="Write a thought…" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} style={{ background: "#fff", borderRadius: 16, padding: 12, minHeight: 64 }} />
            <button className="btn" style={{ height: 46, fontSize: 14 }} disabled={!text.trim()} onClick={async () => { if (await saveNote(text)) setText(""); }}>Save note</button>
            {notes.map((n: Note) => (
              <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ background: "#fff", borderRadius: 16, padding: "10px 12px", fontSize: 14, fontWeight: 500 }}>
                {n.text}
                <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, marginTop: 4 }}>{ago(n.at)}</div>
              </motion.div>
            ))}
          </>
        )}
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>Stamps</div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none" }}>
          <StampArt label="FIRST WORD" n="001" size={110} />
          {stamps.includes("first-follow") ? <StampArt label="FIRST COPY" n="002" size={110} /> : <div style={{ width: 110, height: 123, borderRadius: 8, border: "2px dashed var(--line)", display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 12, fontWeight: 700, textAlign: "center", padding: 8, flex: "0 0 auto" }}>Start autopilot to earn the next</div>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 600, textAlign: "center" }}>
        {practice ? "Practice mode: simulated trades, nothing sent on-chain." : "Live mode: copies are real transactions on Monad testnet."} · Data: {tradersLive ? "Envio" : "demo"}
      </div>

      <button className="btn" style={{ background: "var(--coral-soft)", color: "var(--down)" }} onClick={() => setConfirm(true)}>Disconnect wallet</button>

      <Sheet open={money !== null} onClose={() => setMoney(null)}>
        <div style={{ display: "grid", gap: 14 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center" }}>{money === "deposit" ? "Add to trading" : "Take out"}</h2>
          <div className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800 }}>$</span>
            <input className="field-line num" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            <button className="chip" onClick={() => setAmount(String(Math.floor(max * 100) / 100))}>Max</button>
          </div>
          <div className="fine" style={{ margin: 0 }}>Available {usd(max)}{money === "deposit" && !perplAccount ? " · first deposit opens your trading account" : ""}</div>
          <Button busy={busy === "deposit" || busy === "withdraw"} disabled={!ok} onClick={async () => { const done = money === "deposit" ? await deposit(Number(amount)) : await withdraw(Number(amount)); if (done) { setMoney(null); setAmount(""); } }}>
            Confirm
          </Button>
        </div>
      </Sheet>

      <Sheet open={confirm} onClose={() => setConfirm(false)}>
        <div style={{ display: "grid", gap: 14 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center" }}>Disconnect wallet?</h2>
          <p className="sub">Autopilot stops and this device forgets you. Your passkey and funds stay safe in iCloud and on-chain. Sign in again anytime.</p>
          <button className="btn" style={{ background: "var(--down)" }} onClick={() => { setConfirm(false); disconnect(); }}>Disconnect</button>
          <button className="btn ghost" onClick={() => setConfirm(false)}>Stay connected</button>
        </div>
      </Sheet>
    </div>
  );
}
